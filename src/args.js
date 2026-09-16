const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse CLI arguments. Pure function so it can be unit tested.
 */
export function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    command: "run",
    projectDir: ".",
    prompt: null,
    name: null,
    noConfig: false,
    // true = pick from a list, string = session id, null = default behavior
    resume: null,
    fresh: false,
    help: false,
    extra: [],
  };

  // Check if first arg is a command
  const commands = ["run", "list", "ls", "stop", "rm", "remove", "resume", "sessions", "status"];
  if (args[0] && commands.includes(args[0])) {
    const aliases = { remove: "rm", ls: "list" };
    parsed.command = aliases[args[0]] || args[0];
    args.shift();
  }

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "-v" || arg === "--version") {
      parsed.command = "version";
    } else if (arg === "-h" || arg === "--help") {
      parsed.help = true;
    } else if (arg === "-p" || arg === "--prompt") {
      parsed.prompt = args[++i];
    } else if (arg === "-n" || arg === "--name") {
      parsed.name = args[++i];
    } else if (arg === "--resume") {
      // The id is optional; only take the next arg when it looks like one so
      // `claude-sandbox --resume ./project` still treats ./project as the dir.
      parsed.resume = SESSION_ID.test(args[i + 1] || "") ? args[++i] : true;
    } else if (arg.startsWith("--resume=")) {
      parsed.resume = arg.slice("--resume=".length) || true;
    } else if (arg === "--new") {
      parsed.fresh = true;
    } else if (arg === "--no-config" || arg === "--no-auth") {
      // --no-auth kept as a legacy alias from the docker-sandbox era
      parsed.noConfig = true;
    } else if (!arg.startsWith("-")) {
      // First non-flag arg is project dir or sandbox name
      if (parsed.command === "run" && parsed.projectDir === ".") {
        parsed.projectDir = arg;
      } else {
        parsed.extra.push(arg);
      }
    }
    i++;
  }

  return parsed;
}
