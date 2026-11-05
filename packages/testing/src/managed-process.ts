import { spawn } from 'node:child_process';

export async function runManagedProcess(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<never> {
  let executable = command;
  let executableArgs = args;
  if (process.platform === 'win32') {
    const commandParts = [command === 'npm' ? 'npm.cmd' : command, ...args];
    if (commandParts.some((part) => !/^[a-zA-Z0-9_@./:=+-]+$/.test(part))) {
      throw new Error('Comando filho recusado: argumento incompatível com execução segura.');
    }
    executable = process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe';
    executableArgs = ['/d', '/s', '/c', commandParts.join(' ')];
  }
  const child = spawn(executable, executableArgs, {
    stdio: 'inherit',
    env: environment,
    windowsHide: true,
  });

  const forward = (signal: NodeJS.Signals) => {
    if (!child.killed) child.kill(signal);
  };
  process.once('SIGINT', forward);
  process.once('SIGTERM', forward);

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  process.exit(exitCode);
}
