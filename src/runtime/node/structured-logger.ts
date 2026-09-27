import process from 'node:process';
import {
  createStructuredLogger,
  type StructuredLogger,
} from '../../observability/logger';

export const stderrStructuredLogger: StructuredLogger =
  createStructuredLogger((line) => {
    process.stderr.write(`${line}\n`);
  });
