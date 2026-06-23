$content = Get-Content 'd:\Project\AboT\apps\server\src\server.ts' -Raw
$oldLine = 'return typeof value === "string" && (AGENT_NAMES as readonly string[]).includes(value) ? (value as AgentName) : undefined;'
$newLines = @'
if (typeof value !== "string") return undefined;
  const agentSet = new Set(AGENT_NAMES);
  return agentSet.has(value) ? value : undefined;
'@
$content = $content -replace [regex]::Escape($oldLine), $newLines
Set-Content 'd:\Project\AboT\apps\server\src\server.ts' -Value $content -NoNewline
