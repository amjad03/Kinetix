# Kinetix AI Platform — Detailed Behavioral Requirements

## AI surfaces

- Teacher Copilot
- Student Tutor
- Parent Insights Assistant
- Admin Copilot
- Curriculum Copilot
- Assessment Generator
- Lesson/Content Generator
- Knowledge Assistant
- Analytics Explainer
- Smartboard Context Assistant

## Context assembly

AI requests may be scoped by:

- tenant
- institution
- campus
- user role
- program/grade
- course/subject
- academic year/term
- class/section
- current lesson
- assigned learning resources
- student mastery/performance where authorized

The AI layer must never infer authorization from prompt text. Permissions are checked by the application before context retrieval.

## Model routing

Support configurable routing among:

- local 2–3B model for low-risk/basic tasks and offline-capable assistance
- cloud reasoning/generation providers for complex tasks
- fallback model/provider

## RAG

Retrieval sources can include institution-approved materials, curriculum, OER, licensed resources, faculty content, and approved knowledge bases. Each retrieved source must preserve provenance and rights metadata.

## Safety

- prompt/input validation
- sensitive-data filtering
- output policy checks
- citation/provenance for factual institutional answers
- hallucination mitigation
- confidence/uncertainty where useful
- human approval for high-impact actions

## Cost and usage

Track model, provider, token/compute usage, latency, success/failure, estimated cost, user/tenant attribution, and rate limits.

## Evaluation

Every important AI workflow should have evaluation datasets and regression checks before model/prompt changes are released.
