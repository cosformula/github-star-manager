const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const CLEAR_LINE = "\x1b[2K"; // ANSI escape code to clear entire line

export class Spinner {
  private interval: Timer | null = null;
  private frameIndex = 0;
  private message: string;

  constructor(message = "Thinking") {
    this.message = message;
  }

  start(): void {
    this.frameIndex = 0;
    process.stdout.write(`   ${frames[0]} ${this.message}...`);

    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % frames.length;
      process.stdout.write(`\r${CLEAR_LINE}   ${frames[this.frameIndex]} ${this.message}...`);
    }, 80);
  }

  update(message: string): void {
    this.message = message;
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (finalMessage) {
      process.stdout.write(`\r${CLEAR_LINE}   ✓ ${finalMessage}\n`);
    } else {
      process.stdout.write(`\r${CLEAR_LINE}`);
    }
  }
}

export function withSpinner<T>(message: string, fn: () => Promise<T>): Promise<T> {
  const spinner = new Spinner(message);
  spinner.start();
  return fn().finally(() => spinner.stop());
}
