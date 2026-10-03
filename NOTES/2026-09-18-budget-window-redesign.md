# Budget window — redesign to follow later

Requested 2026-09-18. Not started — parking per user's request ("just add in list to follow later").

## Current state (screenshot reference)
Mobile/narrow Budget screen (Reports > Budget): dark "Budget Overview" hero card with a month pill-row (Jan–Dec) and an empty "No budgets set — tap ••• on a card below" message, then three plain stat boxes (Total spent / Last month / % of income, all showing 0), then a wide empty-state message box, then a dashed "+ Add Budget" button. Reads as disconnected boxes rather than one cohesive screen — no budget cards exist yet to demonstrate the "tap ••• on a card" interaction it references.

## Ask
Redesign for better visual design. No specific direction given yet — needs a design pass (and probably a quick question to the user on direction/tone) before building, same as the document-management app mockups.

## Where it lives
Search for the Budget screen component (Reports section, mobile+desktop) in `src/components/reports.jsx` / `FinanceTracker.jsx` — likely near `SinkingFundsScreen`/other Reports sub-screens given the sidebar grouping (Reports > Budget, Sinking funds).
