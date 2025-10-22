// Minimal ambient declaration for the 'openai' package.
// This allows the repo to compile even if the OpenAI SDK isn't installed.
declare module "openai" {
  const OpenAI: any;
  export default OpenAI;
  export { OpenAI };
}
