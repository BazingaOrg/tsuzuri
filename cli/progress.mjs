const clampPercent = (value) =>
  Math.max(0, Math.min(100, Math.round(Number(value) * 100)));

/** Stable-width percentage output for long-running renderer stages. */
export const createPercentProgress = ({stream = process.stdout} = {}) => {
  let label = null;
  let percent = -1;
  let lastPrintedBucket = -1;
  const interactive = Boolean(stream.isTTY);

  const finishLine = () => {
    if (interactive && label !== null) stream.write('\n');
  };

  return {
    update(nextLabel, value) {
      const nextPercent = clampPercent(value);
      if (nextLabel !== label) {
        finishLine();
        label = nextLabel;
        percent = -1;
        lastPrintedBucket = -1;
      }
      if (nextPercent === percent) return;
      percent = nextPercent;
      const line = `└ ${label.padEnd(18)} ${String(percent).padStart(3)}%`;

      if (interactive) {
        stream.write(`\r\x1b[2K${line}`);
        return;
      }

      // Redirected logs stay concise while still exposing deterministic progress.
      const bucket = percent === 100 ? 4 : Math.floor(percent / 25);
      if (bucket > lastPrintedBucket) {
        stream.write(`${line}\n`);
        lastPrintedBucket = bucket;
      }
    },
    finish() {
      finishLine();
      label = null;
    },
  };
};
