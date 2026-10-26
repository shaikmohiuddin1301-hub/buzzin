# Recommendations

Personalised discovery is a transparent, rules-based ranking in
`src/services/recommendations.ts`. There is no machine-learning model, no
hosted AI call and no invented engagement data. Every signal comes from a row
the product already owns, and every card can explain why it is shown.

The Explore **For you** tab calls `personalisedDiscovery(viewer)` and renders
three lists plus real learning topics:

- projects worth opening,
- people to follow,
- learning that fits the viewer.

## Signals and weights

| Signal | Source record | Weight |
| --- | --- | --- |
| Project needs a listed skill | `project_skills` ∩ `user_skills` | 4, plus 2 per extra matching skill (max two more) |
| Project category chosen | `user_preferences.categories` | 3 |
| Text interest match | `user_preferences.interests` against project text/skills | 1.5 |
| Project owner followed | `follows` | 2.5 |
| Open tasks available | `tasks.status = 'open'` for the project | 1.5 |
| Published in the last 14 days | `projects.published_at` | 1.5 |
| Project goal fit | `users.goals` contains `contribute` or `build_projects` | 1 |
| Person shares a skill | `user_skills` ∩ `user_skills` | 4, plus 1 per extra shared skill (max two) |
| Same stated location | `users.location` | 1.5 |
| Resource matches an interest | `user_preferences.interests` against title/summary/topic/creator | 1.5 |
| Resource matches a skill | `user_skills` against the same text | 1.5 |
| Resource covers a current study topic | `learning_progress` joined to `learning_resources.topic` | 3 |
| Resource creator followed | `follows` | 2.5 |
| Learning goal set | `users.goals` contains `learn` | 1 |
| Recent resource | `learning_resources.published_at` | 1.5 |

Weights are exported as `RECOMMENDATION_WEIGHTS` so the ranking can be tested
and changed in one place. Ties break on recency, then follower count.

## What is never recommended

- Draft, private or unpublished projects/resources. Project and resource
  queries use the existing visibility filters; link-only and private courses
  never enter discovery.
- The viewer's own projects and teaching.
- Projects the viewer already follows, joined or saved.
- People the viewer already follows.
- Resources the viewer has started, completed or saved (they belong in Learning,
  not discovery).
- Accounts or content from either side of a block (`blocked_users`).
- Private organisation work: only what the existing project/resource visibility
  rules already expose.

Recommendations never bypass page-level authorisation. Opening a card runs the
same access checks as any other direct link.

## Missing or partial profile data

If the viewer has no interests, skills, categories or goals, the same queries
still run but every personal signal scores zero. Explore then shows recently
published public content and an explicit prompt to add interests. The product
never blocks the app until a profile is complete.

There is currently no stored "skills I want to learn" field. Learning
recommendations use stated interests, possessed skills, learning goals, followed
creators and topics the viewer has already started. Adding a desired-skills
preference would be a small additive migration and would slot into
`recommendedLearning` without changing the UI contract.

## Not implemented yet

- Dismissing a recommendation or "show me less of this". This needs a persisted
  preference row and is deliberately not faked in client state.
- A separate recommendation API endpoint. Pages call the service directly, as
  the rest of the app does.
- Collaborative filtering or embeddings. The interface is a pure function, so a
  later ranking implementation can replace it behind the same types.

## Tests

`tests/recommendations.test.ts` covers ranking, skill/interest reasons,
exclusions (own, private, draft, joined, followed, blocked), learning-topic
boosts and the empty-profile fallback. `tests/account-context.test.ts` covers
account-kind derivation and Create ordering.
