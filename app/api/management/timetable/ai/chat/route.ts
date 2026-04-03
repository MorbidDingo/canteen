import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  timetable,
  timetableTeacher,
  timetableSubject,
  timetableClassroom,
  timetableStudentGroup,
  timetableSlot,
  organization,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import Anthropic from "@anthropic-ai/sdk";
import { buildTimetableSystemPrompt } from "@/lib/ai/timetable-system-prompt";
import { TIMETABLE_TOOL_DEFINITIONS, executeTimetableTool } from "@/lib/ai/timetable-tools";
import { validateTimetable } from "@/lib/ml/timetable-scheduler";
import { getOptimizationSuggestions } from "@/lib/ml/timetable-optimizer";

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const body = await request.json();
    const { timetableId, messages } = body;

    if (!timetableId || !messages?.length) {
      return NextResponse.json({ error: "Timetable ID and messages are required" }, { status: 400 });
    }

    // Load context
    const [org, tt, teachers, subjects, classrooms, groups] = await Promise.all([
      db.select().from(organization).where(eq(organization.id, organizationId)).then((r) => r[0]),
      db.query.timetable.findFirst({
        where: and(eq(timetable.id, timetableId), eq(timetable.organizationId, organizationId)),
        with: { config: true },
      }),
      db.select().from(timetableTeacher).where(eq(timetableTeacher.organizationId, organizationId)),
      db.select().from(timetableSubject).where(eq(timetableSubject.organizationId, organizationId)),
      db.select().from(timetableClassroom).where(eq(timetableClassroom.organizationId, organizationId)),
      db.select().from(timetableStudentGroup).where(eq(timetableStudentGroup.organizationId, organizationId)),
    ]);

    if (!tt) {
      return NextResponse.json({ error: "Timetable not found" }, { status: 404 });
    }

    const conflicts = await validateTimetable(timetableId);
    const suggestions = await getOptimizationSuggestions(timetableId, organizationId);

    const systemPrompt = buildTimetableSystemPrompt({
      organizationName: org?.name ?? "School",
      timetableName: tt.name,
      timetableId: tt.id,
      teachers: teachers.map((t) => ({ id: t.id, name: t.name, shortCode: t.shortCode })),
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, shortCode: s.shortCode })),
      classrooms: classrooms.map((c) => ({ id: c.id, name: c.name, shortCode: c.shortCode })),
      studentGroups: groups.map((g) => ({ id: g.id, name: g.name, shortCode: g.shortCode })),
      activeDays: (tt.config?.activeDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) as string[],
      periodsPerDay: tt.config?.periodsPerDay ?? 8,
      conflicts: conflicts.map((c) => ({ type: c.type, message: c.message })),
      suggestions: suggestions.map((s) => ({ title: s.title, description: s.description })),
    });

    const anthropic = new Anthropic();

    // Build conversation with tool definitions
    const toolDefs = TIMETABLE_TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool["input_schema"],
    }));

    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools: toolDefs,
      messages: anthropicMessages,
    });

    // Handle tool use loop
    let maxIterations = 5;
    while (response.stop_reason === "tool_use" && maxIterations > 0) {
      maxIterations--;

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ContentBlockParam & { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
          block.type === "tool_use",
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeTimetableTool(toolUse.name, toolUse.input, {
          timetableId,
          organizationId,
          userId: access.actorUserId,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      anthropicMessages.push({ role: "assistant", content: response.content as Anthropic.ContentBlockParam[] });
      anthropicMessages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools: toolDefs,
        messages: anthropicMessages,
      });
    }

    // Extract text response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    const reply = textBlocks.map((b) => b.text).join("\n");

    return NextResponse.json({ reply, toolsUsed: response.stop_reason === "tool_use" });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Timetable AI chat error:", error);
    return NextResponse.json({ error: "AI chat failed" }, { status: 500 });
  }
}
