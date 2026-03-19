import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

export async function POST(request: NextRequest) {
	if (request.nextUrl.pathname.includes("/sign-up")) {
		return NextResponse.json(
			{ error: "Public self-registration is disabled. Use tenant onboarding." },
			{ status: 403 },
		);
	}

	return handler.POST(request);
}
