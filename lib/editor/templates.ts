export interface EditorTemplate {
  id: string;
  title: string;
  description: string;
  type: "ASSIGNMENT" | "NOTE";
  html: string;
}

export const ASSIGNMENT_TEMPLATES: EditorTemplate[] = [
  {
    id: "homework",
    title: "Homework",
    description: "Title, instructions, due date reminder, submission guidelines",
    type: "ASSIGNMENT",
    html: `<h2>Homework: [Subject]</h2>
<p><strong>Due Date:</strong> [Date]</p>
<h3>Instructions</h3>
<p>Please complete the following tasks:</p>
<ol>
<li>Task 1: [Description]</li>
<li>Task 2: [Description]</li>
<li>Task 3: [Description]</li>
</ol>
<h3>Submission Guidelines</h3>
<ul>
<li>Submit your work by [time] on [date]</li>
<li>Write your name and class on every page</li>
<li>Incomplete submissions will not be accepted</li>
</ul>
<p><em>If you have any questions, please ask in class or message the teacher.</em></p>`,
  },
  {
    id: "project",
    title: "Project",
    description: "Overview, objectives, milestones, rubric, resources",
    type: "ASSIGNMENT",
    html: `<h2>Project: [Title]</h2>
<h3>Overview</h3>
<p>[Brief description of the project and its purpose]</p>
<h3>Objectives</h3>
<ul>
<li>Students will be able to [objective 1]</li>
<li>Students will be able to [objective 2]</li>
<li>Students will be able to [objective 3]</li>
</ul>
<h3>Milestones</h3>
<ol>
<li><strong>Week 1:</strong> [Research and planning]</li>
<li><strong>Week 2:</strong> [First draft / prototype]</li>
<li><strong>Week 3:</strong> [Final submission]</li>
</ol>
<h3>Resources</h3>
<ul>
<li>[Resource 1]</li>
<li>[Resource 2]</li>
</ul>`,
  },
  {
    id: "worksheet",
    title: "Worksheet",
    description: "Questions with numbered blanks, instructions",
    type: "ASSIGNMENT",
    html: `<h2>Worksheet: [Topic]</h2>
<p><strong>Name:</strong> ________________ <strong>Class:</strong> _________ <strong>Date:</strong> _________</p>
<h3>Instructions</h3>
<p>Answer all questions in complete sentences. Show your working where applicable.</p>
<h3>Questions</h3>
<ol>
<li>[Question 1]</li>
<li>[Question 2]</li>
<li>[Question 3]</li>
<li>[Question 4]</li>
<li>[Question 5]</li>
</ol>`,
  },
  {
    id: "reading",
    title: "Reading Assignment",
    description: "Book/chapter, guiding questions, reflection prompt",
    type: "ASSIGNMENT",
    html: `<h2>Reading Assignment</h2>
<p><strong>Read:</strong> [Book/Chapter name], pages [X] to [Y]</p>
<h3>Guiding Questions</h3>
<p>While reading, think about the following:</p>
<ol>
<li>[Question 1]</li>
<li>[Question 2]</li>
<li>[Question 3]</li>
</ol>
<h3>Reflection</h3>
<p>After reading, write a short paragraph (5–7 sentences) about what you found most interesting and why.</p>`,
  },
  {
    id: "lab-report",
    title: "Lab Report",
    description: "Aim, materials, procedure, observations, conclusion",
    type: "ASSIGNMENT",
    html: `<h2>Lab Report: [Experiment Title]</h2>
<h3>Aim</h3>
<p>[State the purpose of the experiment]</p>
<h3>Materials</h3>
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
<p>[Record your observations here]</p>
<h3>Conclusion</h3>
<p>[Summarise your findings and whether the aim was achieved]</p>`,
  },
];

export const NOTE_TEMPLATES: EditorTemplate[] = [
  {
    id: "announcement",
    title: "Announcement",
    description: "Header, body, call-to-action, contact info",
    type: "NOTE",
    html: `<h2>[Announcement Title]</h2>
<p>Dear Parents and Guardians,</p>
<p>[Main announcement content goes here. Keep it clear and concise.]</p>
<h3>What You Need to Do</h3>
<ul>
<li>[Action item 1]</li>
<li>[Action item 2]</li>
</ul>
<p>For questions, please contact [Name] at [email/phone].</p>
<p>Thank you for your cooperation.</p>`,
  },
  {
    id: "event-notice",
    title: "Event Notice",
    description: "Event details, schedule, what to bring, RSVP",
    type: "NOTE",
    html: `<h2>[Event Name]</h2>
<p>We are pleased to invite you to [event description].</p>
<h3>Details</h3>
<ul>
<li><strong>Date:</strong> [Date]</li>
<li><strong>Time:</strong> [Start time] – [End time]</li>
<li><strong>Venue:</strong> [Location]</li>
</ul>
<h3>What to Bring</h3>
<ul>
<li>[Item 1]</li>
<li>[Item 2]</li>
</ul>
<h3>RSVP</h3>
<p>Please confirm your attendance by [date]. Reply to this message or contact [Name].</p>`,
  },
  {
    id: "newsletter",
    title: "Newsletter",
    description: "Welcome, highlights, upcoming dates, closing",
    type: "NOTE",
    html: `<h2>[School Name] Newsletter — [Month Year]</h2>
<p>Dear Parents,</p>
<p>Welcome to this month's newsletter! Here's what's been happening and what's coming up.</p>
<h3>Highlights</h3>
<ul>
<li>[Achievement or event highlight 1]</li>
<li>[Achievement or event highlight 2]</li>
<li>[Achievement or event highlight 3]</li>
</ul>
<h3>Upcoming Dates</h3>
<ul>
<li><strong>[Date]:</strong> [Event]</li>
<li><strong>[Date]:</strong> [Event]</li>
<li><strong>[Date]:</strong> [Event]</li>
</ul>
<p>Warm regards,<br>[Sender Name]</p>`,
  },
  {
    id: "circular",
    title: "Circular",
    description: "Subject, body, important dates, compliance note",
    type: "NOTE",
    html: `<h2>Circular: [Subject]</h2>
<p><strong>Date:</strong> [Date]</p>
<p><strong>To:</strong> All Parents / [Specific audience]</p>
<hr>
<p>[Main circular content. Explain the matter clearly and state any required actions.]</p>
<h3>Important Dates</h3>
<ul>
<li><strong>[Date]:</strong> [Deadline or event]</li>
</ul>
<p><em>Please acknowledge receipt of this circular by [method].</em></p>
<p>Thank you,<br>[Authority Name]<br>[Designation]</p>`,
  },
  {
    id: "meeting-minutes",
    title: "Meeting Minutes",
    description: "Date, attendees, agenda, decisions, action items",
    type: "NOTE",
    html: `<h2>Meeting Minutes — [Meeting Title]</h2>
<p><strong>Date:</strong> [Date] | <strong>Time:</strong> [Time] | <strong>Location:</strong> [Venue]</p>
<h3>Attendees</h3>
<ul>
<li>[Name 1]</li>
<li>[Name 2]</li>
<li>[Name 3]</li>
</ul>
<h3>Agenda</h3>
<ol>
<li>[Topic 1]</li>
<li>[Topic 2]</li>
<li>[Topic 3]</li>
</ol>
<h3>Decisions</h3>
<ul>
<li>[Decision 1]</li>
<li>[Decision 2]</li>
</ul>
<h3>Action Items</h3>
<ul>
<li>[Task] — assigned to [Person] — due [Date]</li>
<li>[Task] — assigned to [Person] — due [Date]</li>
</ul>`,
  },
];

export const ALL_TEMPLATES = [...ASSIGNMENT_TEMPLATES, ...NOTE_TEMPLATES];
