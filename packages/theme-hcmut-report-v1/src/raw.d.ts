declare module '*?raw' {
  const source: string;
  export default source;
}

declare module '*?url' {
  const url: string;
  export default url;
}

declare module '*?url&inline' {
  const dataUrl: string;
  export default dataUrl;
}
