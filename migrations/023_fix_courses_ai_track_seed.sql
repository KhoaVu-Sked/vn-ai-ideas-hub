-- Migration 023 — fix for UAT: courses got extra catalog fields
--
-- 022 already ran against UAT before these fields were known to be
-- needed (the source spreadsheet has cost + outcome + a stage label
-- that 022's courses table didn't carry). This brings an
-- already-provisioned courses table up to the shape now in 022/
-- schema.sql, then seeds the AI Track's 23 real courses.
--
-- Safe to run more than once (idempotent). Once every environment
-- that ran 022 has also run this, there's nothing left for it to do —
-- keep the file for the record, matching how 021 stayed after fixing 020.

alter table courses add column if not exists stage text;
alter table courses add column if not exists cost text;
alter table courses add column if not exists outcome text;
alter table courses drop constraint if exists courses_track_id_title_key;
alter table courses add constraint courses_track_id_title_key unique (track_id, title);

insert into courses (track_id, stage, focus_area, title, platform, priority, est_hours, cost, outcome, expected_by_position, link)
select (select id from tracks where name = 'AI Track'), v.*
from (values
  ('L0 — Foundations', 'How AI & LLMs work; capabilities & limits', 'AI Capabilities and Limitations', 'Anthropic Academy', 'core', 2.0, 'Free', 'Explain what generative AI is, what it can and can''t do, and where it fails.', 'intern', 'https://anthropic.skilljar.com/ai-capabilities-and-limitations'),
  ('L0 — Foundations', 'Everyday AI for work', 'Claude 101', 'Anthropic Academy', 'core', 2.0, 'Free', 'Use Claude for writing, summarizing, and analyzing documents.', 'intern', 'https://anthropic.skilljar.com/claude-101'),
  ('L0 — Foundations', 'AI fluency, ethics & safe use', 'AI Fluency: Framework & Foundations', 'Anthropic Academy', 'core', 4.0, 'Free', 'Apply the Effective/Efficient/Ethical/Safe framework; know when NOT to trust AI.', 'intern', 'https://anthropic.skilljar.com/ai-fluency-framework-foundations'),
  ('L0 — Foundations', 'Customer-data safety & policy', 'Skedulo AI Usage Policy', 'Confluence (Internal)', 'core', 1.0, 'Free', 'Handle customer data safely and follow Skedulo''s AI Usage Policy.', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/IS/pages/3355443246/Artificial+Intelligence+AI+Usage+Policy'),
  ('L0 — Foundations', 'Self-paced video primer', 'GenAI for Beginners', 'Udemy Business', 'optional', 3.0, 'Udemy Business', 'Reinforce the fundamentals in a self-paced video format.', 'intern', 'https://skedulo.udemy.com/course/generative-ai-for-beginners-b/'),
  ('L1 — Applied for Support', 'Prompt engineering fundamentals', 'Prompt Engineering: ChatGPT, Claude & AI Masterclass', 'Udemy Business', 'core', 6.0, 'Udemy Business', 'Write effective prompts (chain-of-thought, few-shot, role-based) across Claude & Gemini.', 'junior', 'https://skedulo.udemy.com/course/complete-ai-guide/'),
  ('L1 — Applied for Support', 'AI for support tasks', 'Customer Experience with Generative AI', 'Udemy Business', 'core', 4.0, 'Udemy Business', 'Use AI for support tasks: chatbots, personalization, ticket/data analysis, and ethical customer engagement.', 'junior', 'https://skedulo.udemy.com/course/customer-experience-learnit/'),
  ('L1 — Applied for Support', 'Gemini for daily work', 'Gemini for Google Workspace (learning path)', 'Google Skills', 'core', 4.0, 'Free', 'Use Gemini to summarize, draft replies, and research in daily tools.', 'junior', 'https://www.skills.google/paths/249'),
  ('L1 — Applied for Support', 'Team workflows with Claude', 'Claude for Work', 'Anthropic Academy', 'core', 3.0, 'Free', 'Use Projects and shared workflows to standardize support output.', 'junior', 'https://www.anthropic.com/learn'),
  ('L1 — Applied for Support', 'DevRev product mastery', 'DevRev Product Mastery', 'DevRev University', 'core', 3.0, 'Free (DevRev)', 'Navigate DevRev (tickets, parts, workflows) confidently to handle support cases.', 'junior', 'https://devrevu.reach360.com/learn/course/4bd98843-4bbf-4084-8487-39d807bca5ae'),
  ('L1 — Applied for Support', 'AI foundations & industry applications', 'AI Foundations & Industry Applications', 'DevRev University', 'core', 2.0, 'Free (DevRev)', 'Understand core AI concepts and how they apply across industries and support work.', 'junior', 'https://devrevu.reach360.com/learn/course/5e1b06c7-4f78-4ccc-a940-1eae6a8bb187'),
  ('L2 — Intermediate', 'Reusable assistants & prompt libraries', 'Custom assistants: Claude Projects / Gemini Gems', 'Anthropic Academy + Google', 'core', 3.0, 'Free', 'Build and share reusable assistants and prompt templates for the team.', 'middle', 'https://www.anthropic.com/learn'),
  ('L2 — Intermediate', 'What is an agent? (agentic AI)', 'Introduction to Claude Cowork', 'Anthropic Academy', 'core', 2.0, 'Free', 'Understand agents that take actions, not just chat — non-technical friendly.', 'middle', 'https://anthropic.skilljar.com/introduction-to-claude-cowork'),
  ('L2 — Intermediate', 'Delegating to subagents (concept)', 'Introduction to subagents', 'Anthropic Academy', 'core', 2.0, 'Free', 'Understand how work is delegated to subagents and how context is managed.', 'middle', 'https://anthropic.skilljar.com/introduction-to-subagents'),
  ('L2 — Intermediate', 'Connecting AI to tools & data (concept)', 'Introduction to Model Context Protocol (MCP)', 'Anthropic Academy', 'core', 2.0, 'Free', 'Understand how agents connect to external tools and data sources.', 'middle', 'https://anthropic.skilljar.com/introduction-to-model-context-protocol'),
  ('L2 — Intermediate', 'Gemini fluency + Google AI Studio', 'Generative AI with Gemini and Google AI Studio for Beginners', 'Udemy Business', 'core', 6.0, 'Udemy Business', 'Deepen Gemini fluency (Gems, Deep Research, NotebookLM) and build a custom AI tool in Google AI Studio (bridges to L3).', 'senior', 'https://skedulo.udemy.com/course/google-bard-the-ultimate-guide-master-generative-ai/'),
  ('L3 — Advanced (Technical)', 'Claude API & tool use', 'Build with Claude (API)', 'Anthropic Academy', 'core', 6.0, 'Free', 'Call the Claude API and implement tool use in code.', 'principal', 'https://anthropic.skilljar.com/claude-with-the-anthropic-api'),
  ('L3 — Advanced (Technical)', 'Build connectors (MCP development)', 'Model Context Protocol — build servers', 'Anthropic Academy', 'core', 6.0, 'Free', 'Build MCP servers so agents can use your tools and data.', 'principal', 'https://anthropic.skilljar.com/model-context-protocol-advanced-topics'),
  ('L3 — Advanced (Technical)', 'Coding with an AI agent', 'Claude Code 101', 'Anthropic Academy', 'core', 3.0, 'Free', 'Use Claude Code for real coding tasks (Explore -> Plan -> Code).', 'principal', 'https://anthropic.skilljar.com/claude-code-101'),
  ('L3 — Advanced (Technical)', 'Advanced agentic coding', 'Claude Code in Action', 'Anthropic Academy', 'core', 4.0, 'Free', 'Apply Claude Code to larger, multi-step workflows.', 'principal', 'https://anthropic.skilljar.com/claude-code-in-action'),
  ('L3 — Advanced (Technical)', 'AI pair programming with GitHub Copilot (Enterprise)', 'GitHub Copilot Fundamentals (learning path, Part 1 & 2)', 'Microsoft Learn / GitHub', 'core', 8.0, 'Free (Copilot Enterprise)', 'Use GitHub Copilot across the SDLC: chat, agent mode, Copilot Cloud Agent, and the GitHub MCP server in an enterprise setup.', 'principal', 'https://learn.microsoft.com/en-us/training/paths/copilot/'),
  ('L3 — Advanced (Technical)', 'Multi-agent / subagent design (hands-on)', 'Introduction to subagents (applied)', 'Anthropic Academy', 'core', 3.0, 'Free', 'Design multi-agent systems that delegate and coordinate work.', 'principal', 'https://anthropic.skilljar.com/introduction-to-subagents'),
  ('L3 — Advanced (Technical)', 'Capstone: build an LLM app', 'Generative AI + LLM App Development Bootcamp (opt. LangChain)', 'Udemy Business', 'core', 30.0, 'Udemy Business', 'Design and ship an agent / LLM application end-to-end.', 'principal', 'https://skedulo.udemy.com/course/bootcamp-generative-artificial-intelligence-and-llm-app-development/')
) as v(stage, focus_area, title, platform, priority, est_hours, cost, outcome, expected_by_position, link)
on conflict (track_id, title) do nothing;
