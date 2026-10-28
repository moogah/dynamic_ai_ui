// Loads a module of the site by its path from the project root, at run time.
// The pending tests reach the code through this, so a module that does not exist yet fails
// the test that needs it instead of the whole file.
export function load(path: string): Promise<any> {
  return import(/* @vite-ignore */ path);
}
