# Data Directory

This directory holds JSON data files extracted from JavaScript source files.

The separation of data from code:
- Makes data easier to review and edit independently
- Reduces JS bundle sizes
- Allows data to be loaded on-demand
- Simplifies testing with mock data

Files here are loaded by the corresponding modules in `src/game/`.
