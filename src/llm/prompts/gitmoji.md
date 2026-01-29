Prefix the commit subject with exactly one gitmoji (Unicode emoji character) followed by a space.

### Format

When combined with conventional commits style:

```
<emoji> type(scope?): description
```

When used with freeform style:

```
<emoji> description
```

### Rules

1. Use exactly ONE emoji per commit - choose the one that best represents the primary change.
2. Use the actual Unicode emoji character, not the `:shortcode:` format.
3. Place the emoji at the very beginning of the subject line.
4. Add a single space between the emoji and the rest of the subject.
5. If the change spans multiple categories, choose the emoji for the most significant aspect.

### Gitmoji Reference

Select the most appropriate emoji from this reference:

#### Features & Enhancements

| Emoji | Code                     | Use When                                                                         |
| ----- | ------------------------ | -------------------------------------------------------------------------------- |
| ✨    | `:sparkles:`             | Introducing a new feature                                                        |
| 💄    | `:lipstick:`             | Adding or updating UI/style files                                                |
| 🎨    | `:art:`                  | Improving code structure/format (not style type - this is for code organization) |
| 🚸    | `:children_crossing:`    | Improving user experience/usability                                              |
| 💫    | `:dizzy:`                | Adding or updating animations/transitions                                        |
| 🥅    | `:goal_net:`             | Catching errors                                                                  |
| 🔍️    | `:mag:`                  | Improving SEO                                                                    |
| 🌐    | `:globe_with_meridians:` | Internationalization and localization                                            |
| ♿️    | `:wheelchair:`           | Improving accessibility                                                          |
| 💬    | `:speech_balloon:`       | Adding or updating text/literals                                                 |
| 🏷️    | `:label:`                | Adding or updating types (TypeScript, Flow)                                      |

#### Bug Fixes

| Emoji | Code                 | Use When                            |
| ----- | -------------------- | ----------------------------------- |
| 🐛    | `:bug:`              | Fixing a bug                        |
| 🚑️    | `:ambulance:`        | Critical hotfix                     |
| 🩹    | `:adhesive_bandage:` | Simple fix for a non-critical issue |
| 🔒️    | `:lock:`             | Fixing security issues              |
| 🍎    | `:apple:`            | Fixing something on macOS           |
| 🐧    | `:penguin:`          | Fixing something on Linux           |
| 🏁    | `:checkered_flag:`   | Fixing something on Windows         |
| 🤖    | `:robot:`            | Fixing something on Android         |
| 🍏    | `:green_apple:`      | Fixing something on iOS             |

#### Performance & Optimization

| Emoji | Code            | Use When                            |
| ----- | --------------- | ----------------------------------- |
| ⚡️    | `:zap:`         | Improving performance               |
| 🔥    | `:fire:`        | Removing code or files              |
| 🗑️    | `:wastebasket:` | Deprecating code that needs cleanup |

#### Documentation

| Emoji | Code               | Use When                                   |
| ----- | ------------------ | ------------------------------------------ |
| 📝    | `:memo:`           | Adding or updating documentation           |
| 💡    | `:bulb:`           | Adding or updating comments in source code |
| 📄    | `:page_facing_up:` | Adding or updating license                 |

#### Testing

| Emoji | Code                 | Use When                           |
| ----- | -------------------- | ---------------------------------- |
| ✅    | `:white_check_mark:` | Adding, updating, or passing tests |
| 🧪    | `:test_tube:`        | Adding a failing test              |
| 🤡    | `:clown_face:`       | Mocking things                     |
| 📸    | `:camera_flash:`     | Adding or updating snapshots       |

#### Dependencies & Build

| Emoji | Code                    | Use When                                      |
| ----- | ----------------------- | --------------------------------------------- |
| ⬆️    | `:arrow_up:`            | Upgrading dependencies                        |
| ⬇️    | `:arrow_down:`          | Downgrading dependencies                      |
| 📌    | `:pushpin:`             | Pinning dependencies to specific versions     |
| ➕    | `:heavy_plus_sign:`     | Adding a dependency                           |
| ➖    | `:heavy_minus_sign:`    | Removing a dependency                         |
| 📦️    | `:package:`             | Adding or updating compiled files or packages |
| 👷    | `:construction_worker:` | Adding or updating CI build system            |
| 💚    | `:green_heart:`         | Fixing CI build                               |
| 🔧    | `:wrench:`              | Adding or updating configuration files        |
| 🔨    | `:hammer:`              | Adding or updating development scripts        |

#### Code Quality & Refactoring

| Emoji | Code             | Use When                                            |
| ----- | ---------------- | --------------------------------------------------- |
| ♻️    | `:recycle:`      | Refactoring code                                    |
| 🚚    | `:truck:`        | Moving or renaming resources (files, paths, routes) |
| ✏️    | `:pencil2:`      | Fixing typos                                        |
| 🩺    | `:stethoscope:`  | Adding or updating health checks                    |
| 🧱    | `:bricks:`       | Infrastructure-related changes                      |
| 🧑‍💻    | `:technologist:` | Improving developer experience                      |
| 💩    | `:poop:`         | Writing bad code that needs improvement             |
| 🍱    | `:bento:`        | Adding or updating assets                           |

#### Version Control & Releases

| Emoji | Code                          | Use When                             |
| ----- | ----------------------------- | ------------------------------------ |
| 🎉    | `:tada:`                      | Beginning a project (initial commit) |
| 🔖    | `:bookmark:`                  | Releasing/version tags               |
| 🚀    | `:rocket:`                    | Deploying stuff                      |
| ⏪️    | `:rewind:`                    | Reverting changes                    |
| 🔀    | `:twisted_rightwards_arrows:` | Merging branches                     |

#### Database & Data

| Emoji | Code              | Use When                            |
| ----- | ----------------- | ----------------------------------- |
| 🗃️    | `:card_file_box:` | Performing database-related changes |
| 🌱    | `:seedling:`      | Adding or updating seed files       |

#### Security & Secrets

| Emoji | Code                     | Use When                             |
| ----- | ------------------------ | ------------------------------------ |
| 🔐    | `:closed_lock_with_key:` | Adding or updating secrets           |
| 🛂    | `:passport_control:`     | Working on authorization/permissions |

#### Work In Progress

| Emoji | Code             | Use When                      |
| ----- | ---------------- | ----------------------------- |
| 🚧    | `:construction:` | Work in progress              |
| 🙈    | `:see_no_evil:`  | Adding or updating .gitignore |

#### Other

| Emoji | Code            | Use When                                      |
| ----- | --------------- | --------------------------------------------- |
| 🍻    | `:beers:`       | Writing code drunkenly                        |
| 🥚    | `:egg:`         | Adding or updating easter eggs                |
| 🧵    | `:thread:`      | Adding or updating multithreading/concurrency |
| 🦺    | `:safety_vest:` | Adding or updating validation                 |

### Common Mappings to Conventional Commit Types

When using both gitmoji and conventional commits, prefer these pairings:

| Type       | Primary Emoji | Alternatives |
| ---------- | ------------- | ------------ |
| `feat`     | ✨            | 🚸 💄 🌐 ♿️  |
| `fix`      | 🐛            | 🚑️ 🩹 🔒️     |
| `docs`     | 📝            | 💡           |
| `style`    | 🎨            |              |
| `refactor` | ♻️            | 🚚 ✏️        |
| `perf`     | ⚡️            |              |
| `test`     | ✅            | 🧪           |
| `build`    | 📦️            | 🔧 🔨        |
| `ci`       | 👷            | 💚           |
| `chore`    | 🔧            | 🙈           |
| `revert`   | ⏪️            |              |

### Examples

**Feature (conventional):**

```
✨ feat(auth): add two-factor authentication
```

**Bug fix (conventional):**

```
🐛 fix(parser): handle null values in JSON input
```

**Documentation (freeform):**

```
📝 update API documentation with new endpoints
```

**Performance (conventional):**

```
⚡️ perf(db): add index for frequent queries
```

**Dependencies (conventional):**

```
⬆️ build(deps): upgrade React to v18.2
```

**Critical hotfix (conventional):**

```
🚑️ fix(auth): patch token validation vulnerability
```

**Refactor (freeform):**

```
♻️ extract common utilities into shared module
```
