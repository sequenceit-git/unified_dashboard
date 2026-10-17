# Customer Support AI Agent Architecture

Sandbox Chat Interface (later it will be production chat interference)
        |
        v
POST /api/support/sandbox/messages
        |
        v
Request Validation & Rate Limiting
        |
        v
Conversation Lookup + Save Customer Message
        |
        v
Deterministic Scope / Spam Gate
        |
        +---- Spam / Out of Scope
        |          |
        |          v
        |     Fixed Response
        |
        v
Load Relevant Conversation History
        |
        v
OpenAI Agents SDK — Single Support Agent
        |
        +---- Search Products (READ ONLY)
        |
        +---- Get Product Details (READ ONLY)
        |
        +---- Search Approved FAQ / Policies
        |
        v
Generate Structured, Concise Reply
        |
        v
Validate Status, Evidence and Response Length
        |
        v
Save Assistant Message + Run Metadata
        |
        v
Return Response to Sandbox (later it will be production chat interference)
