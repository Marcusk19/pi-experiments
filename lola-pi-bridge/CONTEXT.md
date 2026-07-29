# Lola Pi Bridge

The Lola Pi Bridge makes Lola-managed capabilities available within Pi while preserving Lola as their owner.

## Language

**Lola Module**:
A registered Lola-managed collection that can contain zero or more Agent Skills.
_Avoid_: Installed skill, package

**Agent Skill**:
A named set of agent instructions contained within a Lola Module.
_Avoid_: Module, package

**Skill Conflict**:
A situation where two or more Lola Modules contribute an Agent Skill with the same directory name, causing Pi to apply load-order disambiguation.
_Avoid_: collision, duplicate skill

## Relationships

- A **Lola Module** contains zero or more **Agent Skills**
- An **Agent Skill** belongs to exactly one **Lola Module** within the bridge
- Management lifecycle actions apply to a **Lola Module**, while an **Agent Skill** may be browsed or opened
- A **Skill Conflict** exists between two **Lola Modules** that each contribute an **Agent Skill** with the same directory name

## Example dialogue

> **User:** “Can I remove this **Agent Skill**?”
> **Bridge:** “Removal applies to its **Lola Module**. You can browse or open the individual **Agent Skill** without changing module ownership.”

## Flagged ambiguities

- “installed skill” was used for both a Lola-managed collection and an individual skill — resolved: **Lola Module** is the lifecycle unit; **Agent Skill** is the browsable unit within it.
