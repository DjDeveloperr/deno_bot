import { ansiRegex as _regex } from "./deps.ts";

const regex = _regex();
const clean = (str: string) => str.replace(regex, "");
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const CHECK_REGEX = /^Check (\w|\d| |_|-|\.|\||\$|\.)*\n/g;

export interface RunResult {
  error?: string;
  code: number | string;
  stderr?: string;
  stdout?: string;
  time: number;
  unexpected?: boolean;
}

export const MAX_TIME = 500;

export async function runWithDeno(
  lang: string,
  code: string,
  allowImports = false,
): Promise<RunResult> {
  if (!allowImports && code.match(/import(( ?{)|( ?\()| |( (\w|\$|_)))/)) {
    return { time: 0, code: "Error", error: "Imports are not allowed" };
  }

  const result: RunResult = {
    code: "Unknown",
    time: 0,
  };

  try {
    const now = performance.now();
    const proc = Deno.run({
      cmd: [
        Deno.env.get("DENO_PATH") ?? "deno",
        "run",
        "--no-check",
        "--allow-hrtime",
        "--v8-flags=--max-old-space-size=20",
        "-",
      ],
      stdin: "piped",
      stderr: "piped",
      stdout: "piped",
    });

    await proc.stdin.write(encoder.encode(code));
    proc.stdin.close();

    let returned = false;
    let forceKilled = false;
    setTimeout(() => {
      if (!returned) {
        proc.close();
        forceKilled = true;
        result.code = "ForceExit";
        result.error = "Timeout";
      }
    }, MAX_TIME);

    const { code: statusCode } = await proc.status().then((status) => {
      returned = true;
      return status;
    });

    result.time = performance.now() - now;
    result.unexpected = result.time > (MAX_TIME + 50);

    result.code = statusCode;

    if (forceKilled) {
      return result;
    }

    const stdout = clean(decoder.decode(await proc.output())).trim().replaceAll(
      "\r\n",
      "\n",
    );
    const stderr = clean(decoder.decode(await proc.stderrOutput())).trim()
      .replaceAll("\r\n", "\n");

    result.stderr = stderr;
    result.stdout = stdout;

    if (lang === "ts") {
      result.stderr = result.stderr.replaceAll(CHECK_REGEX, "").trim();
    }
  } catch (e) {
    result.error = Deno.inspect(e);
  }

  return result;
}
