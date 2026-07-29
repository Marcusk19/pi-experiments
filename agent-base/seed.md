# Agent session tracking

## Motivation
Agents work in parallel across my computer but they don't know what the other sessions are doing, also there can be many different harnesses. eg. claude code, pi, etc. 
I want the ability to ask my agent "hey what's going on what are we currenlty working on?"
claude agent view helps with this, but doesn't extend across other harnesses.

## Solution
write an extension that hooks into any harness that streams the agent session transcript to a database.
expose access to that database on a server so agents can query the session transcripts

start with a pi extension, see if we can extend that to a claude code extension, etc. something re-usable for 
agent harnesses no matter what

the llm should not invoke this call - everything should be done programmatically behind the scenes. we do not
want to waste tokens on this integration

the database always shows a list of *currently* active sessions. when a session is closed we remove that row from the
database

## Open questions
* what's the best way to store sessions? 
* how will it scale with multiple sessions? do we need locks? 
* what protocol do we use? mcp seems archaic to me at this point
* do we gain anything by vector indexing the database? is plan sqlite good enough?

