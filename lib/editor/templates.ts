export interface EditorTemplate {
  id: string;
  title: string;
  description: string;
  category: "assignment" | "note";
  html: string;
}

export const EDITOR_TEMPLATES: EditorTemplate[] = [
  // ─── Assignment Templates ──────────────────────────────
  {
    id: "homework",
    title: "Homework",
    description: "Instructions, due date, and submission guidelines",
    category: "assignment",
    html: `<h2>Homework Assignment</h2>
<p><strong>Subject:</strong> [Subject Name]</p>
<p><strong>Due Date:</strong> [Date]</p>
<hr>
<h3>Instructions</h3>
<p>Please complete the following tasks:</p>
<ol>
<li>[Task 1]</li>
<li>[Task 2]</li>
<li>[Task 3]</li>
</ol>
<h3>Submission Guidelines</h3>
<ul>
<li>Submit your work by the due date</li>
<li>Ensure your name is clearly written on all pages</li>
<li>Late submissions will not be accepted without prior approval</li>
</ul>
<p><em>If you have any questions, please reach out before the due date.</em></p>`,
  },
  {
    id: "project",
    title: "Project Brief",
    description: "Overview, objectives, milestones, and rubric",
    category: "assignment",
    html: `<h2>Project Brief</h2>
<p><strong>Subject:</strong> [Subject Name]</p>
<p><strong>Submission Date:</strong> [Date]</p>
<hr>
<h3>Overview</h3>
<p>[Brief description of the project and its purpose]</p>
<h3>Objectives</h3>
<ul>
<li>[Objective 1]</li>
<li>[Objective 2]</li>
<li>[Objective 3]</li>
</ul>
<h3>Milestones</h3>
<ol>
<li><strong>[Date]:</strong> [Milestone 1]</li>
<li><strong>[Date]:</strong> [Milestone 2]</li>
<li><strong>[Date]:</strong> Final submission</li>
</ol>
<h3>Evaluation Rubric</h3>
<ul>
<li><strong>Content (40%):</strong> Accuracy and depth of research</li>
<li><strong>Presentation (30%):</strong> Clarity and organization</li>
<li><strong>Creativity (20%):</strong> Original thinking and approach</li>
<li><strong>Timeliness (10%):</strong> Meeting all deadlines</li>
</ul>
<h3>Resources</h3>
<p>[List helpful resources, textbooks, or links]</p>`,
  },
  {
    id: "worksheet",
    title: "Worksheet",
    description: "Questions with numbered sections",
    category: "assignment",
    html: `<h2>Worksheet: [Topic Name]</h2>
<p><strong>Name:</strong> _________________ <strong>Date:</strong> _________________</p>
<hr>
<h3>Section A: Fill in the Blanks</h3>
<ol>
<li>The _________ is responsible for _________.</li>
<li>In the year _________, the _________ happened.</li>
<li>The formula for _________ is _________.</li>
</ol>
<h3>Section B: Short Answer</h3>
<ol start="4">
<li>Explain the significance of [topic] in your own words.</li>
<li>List three key features of [concept].</li>
</ol>
<h3>Section C: Think and Answer</h3>
<ol start="6">
<li>Compare and contrast [A] and [B]. Provide examples.</li>
</ol>`,
  },
  {
    id: "reading",
    title: "Reading Assignment",
    description: "Book/chapter with guiding questions",
    category: "assignment",
    html: `<h2>Reading Assignment</h2>
<p><strong>Reading:</strong> [Book/Chapter Name]</p>
<p><strong>Pages:</strong> [Page Range]</p>
<p><strong>Due:</strong> [Date]</p>
<hr>
<h3>Before You Read</h3>
<p>Think about: [Pre-reading question to set context]</p>
<h3>Guiding Questions</h3>
<p>As you read, consider the following:</p>
<ol>
<li>[Question about main idea]</li>
<li>[Question about characters/concepts]</li>
<li>[Question about cause and effect]</li>
</ol>
<h3>Reflection</h3>
<p>After reading, write a short paragraph (5-7 sentences) about:</p>
<ul>
<li>What was the most interesting part and why?</li>
<li>How does this connect to what we discussed in class?</li>
</ul>`,
  },
  {
    id: "lab-report",
    title: "Lab Report",
    description: "Aim, materials, procedure, observations, conclusion",
    category: "assignment",
    html: `<h2>Lab Report</h2>
<p><strong>Experiment:</strong> [Title]</p>
<p><strong>Date:</strong> [Date]</p>
<hr>
<h3>Aim</h3>
<p>[State the objective of the experiment]</p>
<h3>Materials Required</h3>
<ul>
<li>[Material 1]</li>
<li>[Material 2]</li>
<li>[Material 3]</li>
</ul>
<h3>Procedure</h3>
<ol>
<li>[Step 1]</li>
<li>[Step 2]</li>
<li>[Step 3]</li>
</ol>
<h3>Observations</h3>
<p>[Record what you observed during the experiment]</p>
<h3>Conclusion</h3>
<p>[Summarize your findings and whether the aim was achieved]</p>`,
  },

  // ─── Note Templates ────────────────────────────────────
  {
    id: "announcement",
    title: "Announcement",
    description: "Header, body, and call-to-action",
    category: "note",
    html: `<h2>📢 [Announcement Title]</h2>
<p>Dear Parents and Students,</p>
<p>[Main announcement body — keep it clear and concise]</p>
<h3>Key Details</h3>
<ul>
<li><strong>Date:</strong> [Date]</li>
<li><strong>Time:</strong> [Time]</li>
<li><strong>Venue:</strong> [Location]</li>
</ul>
<h3>Action Required</h3>
<p>[What parents/students need to do, by when]</p>
<p>For queries, please contact [Name] at [Email/Phone].</p>
<p>Warm regards,<br>[Your Name]</p>`,
  },
  {
    id: "event-notice",
    title: "Event Notice",
    description: "Event details, schedule, what to bring",
    category: "note",
    html: `<h2>🎉 [Event Name]</h2>
<p>We are excited to announce [event description]!</p>
<h3>Event Details</h3>
<ul>
<li><strong>Date:</strong> [Date]</li>
<li><strong>Time:</strong> [Start Time] – [End Time]</li>
<li><strong>Venue:</strong> [Location]</li>
</ul>
<h3>Schedule</h3>
<ol>
<li><strong>[Time]:</strong> [Activity 1]</li>
<li><strong>[Time]:</strong> [Activity 2]</li>
<li><strong>[Time]:</strong> [Activity 3]</li>
</ol>
<h3>What to Bring</h3>
<ul>
<li>[Item 1]</li>
<li>[Item 2]</li>
</ul>
<p><strong>RSVP by [Date]</strong> to confirm your attendance.</p>`,
  },
  {
    id: "newsletter",
    title: "Newsletter",
    description: "Welcome, highlights, upcoming dates",
    category: "note",
    html: `<h2>📰 School Newsletter — [Month/Week]</h2>
<p>Dear Parents,</p>
<p>Here's a roundup of what's been happening and what's coming up!</p>
<h3>🌟 Highlights</h3>
<ul>
<li>[Achievement or event highlight 1]</li>
<li>[Achievement or event highlight 2]</li>
<li>[Achievement or event highlight 3]</li>
</ul>
<h3>📅 Upcoming Dates</h3>
<ul>
<li><strong>[Date]:</strong> [Event/deadline]</li>
<li><strong>[Date]:</strong> [Event/deadline]</li>
<li><strong>[Date]:</strong> [Event/deadline]</li>
</ul>
<h3>📝 Reminders</h3>
<ul>
<li>[Reminder 1]</li>
<li>[Reminder 2]</li>
</ul>
<p>Thank you for your continued support!</p>
<p>Warm regards,<br>[School Name]</p>`,
  },
  {
    id: "circular",
    title: "Circular",
    description: "Formal notice with compliance requirements",
    category: "note",
    html: `<h2>📋 Circular: [Subject]</h2>
<p><strong>Ref No:</strong> [Reference Number]</p>
<p><strong>Date:</strong> [Date]</p>
<hr>
<p>Dear Parents/Guardians,</p>
<p>[Main body of the circular — formal and clear]</p>
<h3>Important Dates</h3>
<ul>
<li><strong>[Date]:</strong> [What happens]</li>
<li><strong>[Date]:</strong> [What happens]</li>
</ul>
<h3>Compliance Note</h3>
<p>[Any rules, regulations, or requirements that must be followed]</p>
<p>Please acknowledge receipt of this circular.</p>
<p>Regards,<br>[Name]<br>[Designation]</p>`,
  },
  {
    id: "meeting-minutes",
    title: "Meeting Minutes",
    description: "Date, attendees, agenda, decisions, action items",
    category: "note",
    html: `<h2>📝 Meeting Minutes</h2>
<p><strong>Date:</strong> [Date] | <strong>Time:</strong> [Time] | <strong>Venue:</strong> [Location]</p>
<h3>Attendees</h3>
<ul>
<li>[Name 1] — [Role]</li>
<li>[Name 2] — [Role]</li>
<li>[Name 3] — [Role]</li>
</ul>
<h3>Agenda</h3>
<ol>
<li>[Topic 1]</li>
<li>[Topic 2]</li>
<li>[Topic 3]</li>
</ol>
<h3>Discussion & Decisions</h3>
<p><strong>[Topic 1]:</strong> [Summary of discussion and decision reached]</p>
<p><strong>[Topic 2]:</strong> [Summary of discussion and decision reached]</p>
<h3>Action Items</h3>
<ul>
<li><strong>[Name]:</strong> [Task] — by [Date]</li>
<li><strong>[Name]:</strong> [Task] — by [Date]</li>
</ul>
<p><em>Next meeting: [Date and Time]</em></p>`,
  },
];
