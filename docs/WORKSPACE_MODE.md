# Workspace Mode

AboT can be used like a local project workspace: initialize a folder, select it in the UI, then route tasks, inspect files, edit files, and run terminal commands from that project root.

## Initialize a Folder

From the AboT repo:

```txt
npm run workspace:init -- D:\Project\your-project
```

This creates:

```txt
D:\Project\your-project\.abot\project.json
```

If the AboT server is running, the command also registers the folder as a project.

## Run AboT

```txt
npm run dev
```

Open:

```txt
http://127.0.0.1:3217
```

## Workspace Tab

The Workspace tab provides:

- file tree rooted to the selected project
- file read
- file write
- terminal command execution from the project root

The file APIs prevent relative paths from escaping the selected project root.

## Terminal Commands

Commands run with the project root as the working directory.

Examples:

```txt
npm run typecheck
git status -sb
rg "TODO"
```

Command output includes:

- stdout
- stderr
- exit code
- duration
- timeout status

## API Endpoints

List directory:

```txt
GET /api/workspace/tree?projectId=<id>&path=.
```

Read file:

```txt
GET /api/workspace/file?projectId=<id>&path=src/index.ts
```

Write file:

```txt
PUT /api/workspace/file
```

```json
{
  "projectId": "...",
  "path": "src/index.ts",
  "content": "..."
}
```

Run command:

```txt
POST /api/workspace/command
```

```json
{
  "projectId": "...",
  "command": "npm run typecheck",
  "cwd": ".",
  "timeoutMs": 60000
}
```

## Current Limit

v0.01 gives AboT the workspace mechanics. It can browse, edit, save, and run commands. Full autonomous code editing through model execution is the next layer: the model/tool executor should call these workspace APIs and log every file operation.

