/** Use the shortest unique path suffix for files with identical basenames. */
export function documentLabels(paths: string[]): Map<string, string> {
  const parts = paths.map(path => path.split('/').filter(Boolean));
  return new Map(paths.map((path, index) => {
    const own = parts[index]!;
    let length = 1;
    while (length < own.length && parts.some((other, i) => i !== index && other.slice(-length).join('/') === own.slice(-length).join('/'))) length++;
    return [path, own.slice(-length).join('/')];
  }));
}
