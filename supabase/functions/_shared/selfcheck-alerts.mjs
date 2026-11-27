/** Compare current failures with the last persisted selfcheck. */
export function selfcheckFailureDelta(results, previousChecks) {
  const currentFailures = Object.entries(results)
    .filter(([name, result]) => name !== 'backup_history' && result?.ok === false);
  const previousFailures = Object.entries(previousChecks)
    .filter(([name, result]) => name !== 'backup_history' && result?.ok === false);

  const newOrChanged = currentFailures.filter(([name, result]) => {
    const previous = previousChecks[name];
    return previous?.ok !== false || previous.detail !== result.detail;
  });
  const recovered = previousFailures
    .filter(([name]) => results[name]?.ok === true)
    .map(([name]) => name);

  return {
    shouldNotify: newOrChanged.length > 0 || recovered.length > 0,
    newOrChanged,
    recovered,
  };
}
