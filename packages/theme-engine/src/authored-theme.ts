import { escapeLatexText, validateThemeScene, type LatexTheme, type ThemeSceneV2, type ThemeSceneNode, type ThemeDocumentSettings } from './index.js';

export interface AuthoredThemeSnapshot {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  scene: ThemeSceneV2;
}
/** Resolved once for both TeX and DOM; widths include padding, never inherited. */
export interface AuthoredLayout {
  node: ThemeSceneNode;
  style: Record<string, string | number>;
  widthMm: number;
  contentWidthMm: number;
  gapMm: number;
  paddingMm: number;
  children: AuthoredLayout[];
}
export interface AuthoredThemeCompilation {
  theme?: LatexTheme;
  snapshot?: AuthoredThemeSnapshot;
  /** One geometry tree; region properties reference nodes in this tree. */
  layout?: AuthoredLayout;
  rootSectionLayouts?: AuthoredLayout[];
  coverLayout?: AuthoredLayout;
  headerLayout?: AuthoredLayout;
  footerLayout?: AuthoredLayout;
  errors: string[];
}
const layoutWidgets = new Set(['section', 'row', 'column', 'text', 'image-placeholder']);
const layoutParents = new Set(['page', 'section', 'stack', 'body', 'cover', 'header', 'footer', 'row', 'column']);
const families = ['theorem', 'property', 'proposition', 'corollary', 'lemma', 'exercise'];
const widgets = new Set([...layoutParents, ...layoutWidgets, 'paragraph', 'heading', 'page-number', ...families]);
const styleKeys = new Set(['color', 'accent', 'background', 'fontFamily', 'fontSizePt', 'fontWeight', 'fontStyle', 'lineHeight']);
function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }

export function compileAuthoredTheme(value: unknown): AuthoredThemeCompilation {
  // Bound JSON data before recursive shared scene validation (including cycles).
  const pending: Array<{value: unknown; depth: number}> = [{value, depth: 0}];
  let count=0, text=0;
  while (pending.length) {
    const item=pending.pop()!;
    if (++count>8192 || item.depth>40) return {errors:['Authored theme exceeds its data limits.']};
    if (typeof item.value==='string') text+=item.value.length;
    else if (typeof item.value==='number') { if (!Number.isFinite(item.value)) return {errors:['Authored theme requires finite JSON numbers.']}; }
    else if (record(item.value) || Array.isArray(item.value)) {
      for (const [k,v] of Object.entries(item.value)) { text+=k.length; pending.push({value:v,depth:item.depth+1}); }
    }
    else if (item.value !== null && typeof item.value !== 'boolean') return {errors:['Authored theme requires JSON data.']};
    if (text>262144 || pending.length>8192) return {errors:['Authored theme exceeds its data limits.']};
  }
  if (!record(value) || value.schemaVersion!==1 || typeof value.id!=='string' || !/^[a-zA-Z0-9][\w.-]{0,127}$/.test(value.id)
    || typeof value.version!=='string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value.version)
    || typeof value.name!=='string' || !value.name.trim()) return {errors:['Invalid authored theme identity or schema version.']};
  const checked=validateThemeScene(value.scene);
  if (!checked.valid) return {errors: checked.errors};
  const snapshot=value as unknown as AuthoredThemeSnapshot;
  const scene=snapshot.scene;
  const errors: string[]=[];
  const nodes: ThemeSceneNode[]=[];
  const resolved = new Map<string, Record<string, string | number>>();
  function visit(node: ThemeSceneNode, inherited: Record<string,string|number>, insideLayout = false) {
    // Layout descendants are content, never document-wide style definitions.
    if (!insideLayout) nodes.push(node);
    if (!widgets.has(node.widget) || node.version!==1) errors.push(`Unsupported authored widget: ${node.widget}@${node.version}.`);
    if (node.bindings && Object.keys(node.bindings).length) errors.push(`Bindings are not yet supported: ${node.id}.`);
    if (node.children.length && !['page','stack','body'].includes(node.widget) && !layoutParents.has(node.widget)) errors.push(`Custom child layout is not yet supported: ${node.id}.`);
    if (node.widget === 'row') {
      if (node.children.length > 8 || node.children.some(child => child.widget !== 'column')) errors.push(`Rows require 0–8 column children: ${node.id}.`);
    }
    if ((insideLayout || ['cover','header','footer','section','row','column'].includes(node.widget))
      && node.children.some(child => !layoutWidgets.has(child.widget) && !['stack','body'].includes(child.widget))) errors.push(`Unsupported authored layout child: ${node.id}.`);
    const style={...inherited};
    delete style.background;
    for (const [key,raw] of Object.entries(node.style)) {
      if (!styleKeys.has(key)) { errors.push(`Unsupported authored style: ${key}.`); continue; }
      let v: unknown=raw;
      if (record(raw) && typeof raw.token==='string') {
        const token=scene.tokens[raw.token];
        if (!token) { errors.push(`Missing token: ${raw.token}.`);continue; }
        if (token.type==='length' && token.unit!=='pt') {errors.push(`Only pt font sizes are supported: ${raw.token}.`);continue;}
        v=token.value;
      }
      const valid = key==='color'||key==='accent'||key==='background' ? typeof v==='string'&&/^#[\da-f]{6}$/i.test(v)
        : key==='fontFamily' ? typeof v==='string'&&['serif','sans-serif','monospace','Times New Roman'].includes(v)
        : key==='fontSizePt' ? typeof v==='number'&&Number.isFinite(v)&&v>=6&&v<=72
        : key==='lineHeight' ? typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=3
        : key==='fontWeight' ? /^(normal|bold|[1-9]00)$/.test(String(v))
        : key==='fontStyle' ? v==='normal'||v==='italic' : false;
      if (!valid) {errors.push(`Invalid authored style value: ${node.id}.${key}.`);continue;}
      style[key==='accent'?'color':key]=v as string|number;
    }
    for (const [key,v] of Object.entries(node.properties)) {
      const permitted=['title','text','alignment','level','enabled','institution','faculty','left','format','university','school','reportType','major','council','supervisor','secretary','locationDate','heading','gapMm','paddingMm','ratios','heightMm','alt'];
      if (!permitted.includes(key) || !['string','number','boolean'].includes(typeof v)) errors.push(`Unsupported authored property: ${node.id}.${key}.`);
      if (layoutWidgets.has(node.widget) && !['title','alignment',
        ...(node.widget === 'text' ? ['text'] : []),
        ...(layoutParents.has(node.widget) ? ['gapMm', 'paddingMm'] : []),
        ...(node.widget === 'row' ? ['ratios'] : []),
        ...(node.widget === 'image-placeholder' ? ['heightMm', 'alt'] : []),
      ].includes(key)) errors.push(`Unsupported authored layout property: ${node.id}.${key}.`);
      if ((layoutWidgets.has(node.widget) || node.widget === 'cover') && ['title','text','alt'].includes(key) && typeof v !== 'string') errors.push(`Authored layout ${key} must be literal text: ${node.id}.`);
      if (key === 'gapMm' || key === 'paddingMm') {
        const supported = layoutParents.has(node.widget);
        const max = key === 'gapMm' ? 20 : 10;
        if (!supported || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) {
          errors.push(`${key} must be 0–${max}mm on a supported layout container: ${node.id}.`);
        }
      }
      if (key === 'ratios' && (node.widget !== 'row' || typeof v !== 'string'
        || (v !== '' && (!/^(?:[1-9]\d?|100)(?::(?:[1-9]\d?|100))*$/.test(v)
          || v.split(':').length !== node.children.length)))) errors.push(`Ratios require one integer weight 1–100 per column: ${node.id}.`);
      if (key === 'heightMm' && (node.widget !== 'image-placeholder' || typeof v !== 'number' || v < 10 || v > 100)) errors.push(`Image placeholder height must be 10–100mm: ${node.id}.`);
      if (key === 'alt' && (node.widget !== 'image-placeholder' || typeof v !== 'string')) errors.push(`Image placeholder alt must be literal text: ${node.id}.`);
      if (key === 'level' && (node.widget !== 'heading' || typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 4)) errors.push(`Heading level must be 1–4: ${node.id}.`);
      if (key === 'alignment' && !['leading','center','trailing'].includes(String(v))) errors.push(`Invalid alignment: ${node.id}.`);
      if (key === 'enabled' && typeof v !== 'boolean') errors.push(`Enabled must be boolean: ${node.id}.`);
      if (key === 'format' && !['none','current','current-total'].includes(String(v))) errors.push(`Invalid page numbering: ${node.id}.`);
    }
    resolved.set(node.id,style);
    node.children.forEach(child=>visit(child,style,insideLayout || ['cover','header','footer','section','row','column'].includes(node.widget)));
  }
  visit(scene.root,{});
  if (scene.bindings.length) errors.push('Declared bindings are not supported by this authored theme version.');
  if (Object.keys(scene.variants).length) errors.push('Authored variation references are not yet supported. Apply explicit tokens first.');
  for (const widget of ['cover','header','footer','paragraph']) if (nodes.filter(n=>n.widget===widget).length>1) errors.push(`Multiple ${widget} definitions are not supported.`);
  const headingLevels=nodes.filter(n=>n.widget==='heading').map(n=>Number(n.properties.level??2));
  if(new Set(headingLevels).size!==headingLevels.length) errors.push('Multiple definitions for the same heading level are not supported.');
  if (errors.length) return {errors:[...new Set(errors)]};
  const find=(widget: string)=>nodes.find(n=>n.widget===widget);
  const enabled=(n: ThemeSceneNode|undefined)=>!!n&&n.properties.enabled!==false;
  const textValue=(n: ThemeSceneNode|undefined,key: string,fallback='')=>typeof n?.properties[key]==='string'?String(n.properties[key]):fallback;
  const format=(style: Record<string,string|number>): string => {
    const size=Number(style.fontSizePt??11),leading=size*Number(style.lineHeight??1.35);
    const font=style.fontFamily==='sans-serif'?'\\sffamily':style.fontFamily==='monospace'?'\\ttfamily':'\\rmfamily';
    const bold=style.fontWeight==='bold'||Number(style.fontWeight)>=600?'\\bfseries':'\\mdseries';
    return `${font}${bold}${style.fontStyle==='italic'?'\\itshape':'\\upshape'}\\fontsize{${size}}{${leading}}\\selectfont${style.color?`\\color[HTML]{${String(style.color).slice(1)}}`:''}`;
  };
  const alignmentFor=(n?: ThemeSceneNode)=>n?.properties.alignment==='center'?'\\centering':n?.properties.alignment==='trailing'?'\\raggedleft':n?.properties.alignment==='leading'?'\\raggedright':'';
  const styleFor=(n?: ThemeSceneNode)=>format(resolved.get(n?.id??scene.root.id)??{})+alignmentFor(n);
  const cover=find('cover'),header=find('header'),footer=find('footer');
  // Geometry is fixed by this authored version, not by a transient TeX
  // \linewidth inside the previous sibling minipage. Round down to avoid
  // accumulated fractional widths pushing a row outside its parent.
  const boundWidth = (width: number): number => Math.floor((width + 1e-9) * 10000) / 10000;
  const layouts = new Map<string, AuthoredLayout>();
  const buildLayout = (node: ThemeSceneNode, widthMm: number): AuthoredLayout => {
    const gapMm = Number(node.properties.gapMm ?? 4);
    const paddingMm = Number(node.properties.paddingMm ?? 0);
    const contentWidthMm = boundWidth(widthMm - 2 * paddingMm);
    if (contentWidthMm <= 0) errors.push(`Authored layout padding/gaps leave no content width: ${node.id}.`);
    const weights = node.widget === 'row' && node.properties.ratios
      ? String(node.properties.ratios).split(':').map(Number) : node.children.map(() => 1);
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    const available = contentWidthMm - gapMm * Math.max(0, node.children.length - 1);
    const layout: AuthoredLayout = {
      node, style: resolved.get(node.id) ?? {}, widthMm, contentWidthMm, gapMm, paddingMm,
      children: node.children.map((child, index) => buildLayout(child,
        node.widget === 'row' ? boundWidth(available * weights[index]! / weightSum) : contentWidthMm)),
    };
    layouts.set(node.id, layout);
    return layout;
  };
  const layout = buildLayout(scene.root, 160);
  const coverLayout = cover?.children.length ? layouts.get(cover.id) : undefined;
  const headerLayout = header?.children.length ? layouts.get(header.id) : undefined;
  const footerLayout = footer?.children.length ? layouts.get(footer.id) : undefined;
  const rootSectionLayouts: AuthoredLayout[] = [];
  const collectRootLayouts = (current: AuthoredLayout): void => {
    if (layoutWidgets.has(current.node.widget)) rootSectionLayouts.push(current);
    else if (['page','stack','body'].includes(current.node.widget)) current.children.forEach(collectRootLayouts);
  };
  collectRootLayouts(layout);
  if (errors.length) return { errors: [...new Set(errors)] };
  const dimension = (mm: number): string => `${mm.toFixed(4)}mm`;
  const renderLayout = (layout: AuthoredLayout, excluded = new Set<string>()): string => {
    const { node, widthMm, contentWidthMm, gapMm, paddingMm } = layout;
    if (excluded.has(node.id) || (node.widget === 'row' && !layout.children.length)) return '';
    const children = layout.children.filter(child => !(child.node.widget === 'row' && !child.children.length) && !excluded.has(child.node.id));
    const style = format(layout.style) + (alignmentFor(node) || '\\raggedright');
    let content: string;
    if (node.widget === 'text') {
      const literal = textValue(node, 'text');
      content = literal ? '\\noindent ' + literal.split(/\r\n?|\n/)
        .map(line => `\\strut ${escapeLatexText(line)}`).join('\\\\\n') + '\\par\n' : '';
    } else if (node.widget === 'image-placeholder') {
      const label = `Image placeholder${textValue(node, 'alt') ? ': ' + textValue(node, 'alt') : ''}`;
      content = `\\begin{minipage}[t][${dimension(Number(node.properties.heightMm ?? 30))}][c]{${dimension(contentWidthMm)}}${escapeLatexText(label)}\\end{minipage}\\par\n`;
    } else if (node.widget === 'row') {
      content = children.length ? `\\noindent ${children.map(child => renderLayout(child, excluded))
        .join(`%\n\\hspace{${dimension(gapMm)}}%\n`)}\\par\n` : '';
    } else {
      content = children.map(child => `\\noindent ${renderLayout(child, excluded)}\\par\n`)
        .join(`\\vspace{${dimension(gapMm)}}\n\\nointerlineskip\n`);
    }
    if (paddingMm > 0) {
      content = `\\vspace*{${dimension(paddingMm)}}\n\\noindent\\hspace*{${dimension(paddingMm)}}%\n`
        + `\\begin{minipage}[t]{${dimension(contentWidthMm)}}\n\\vspace{0pt}\n${content}\\end{minipage}\\par\n`
        + `\\vspace*{${dimension(paddingMm)}}\n`;
    }
    const box = `\\begin{minipage}[t]{${dimension(widthMm)}}\n\\vspace{0pt}\n${style}\n`
      + `\\setlength{\\parindent}{0pt}\\setlength{\\parskip}{0pt}\n${content}\\end{minipage}`;
    return layout.style.background
      ? `{\\setlength{\\fboxsep}{0pt}\\colorbox[HTML]{${String(layout.style.background).slice(1)}}{${box}}}`
      : box;
  };
  const automaticLayouts = (settings: ThemeDocumentSettings): string => {
    const excluded = new Set(settings.explicitThemeLayoutNodes ?? []);
    return rootSectionLayouts.filter(current => !excluded.has(current.node.id))
      .map(current => `\\noindent ${renderLayout(current, excluded)}\\par\n`).join('');
  };
  const theme: LatexTheme = {
    manifest:{schemaVersion:1,id:snapshot.id,name:snapshot.name,version:snapshot.version,engine:'latex',documentClass:'article',page:{size:'A4'},capabilities:{cover:enabled(cover),toc:true,listOfFigures:true,listOfTables:true,header:enabled(header),footer:enabled(footer),headingDepth:4},components:{},assets:[]},
    renderDocument(body: string, settings: ThemeDocumentSettings) {
      const h=enabled(header)?headerLayout ? renderLayout(headerLayout) : escapeLatexText(textValue(header,'text',textValue(header,'institution',textValue(header,'title')))):'';
      const f=enabled(footer)?footerLayout ? renderLayout(footerLayout) : escapeLatexText(textValue(footer,'left',textValue(footer,'text',textValue(footer,'title')))):'';
      const pageFormat=textValue(find('page-number'),'format',textValue(footer,'format',enabled(footer)?'current':'none'));
      const pageNumber = pageFormat === 'current-total' ? '\\thepage/\\pageref{LastPage}' : pageFormat === 'current' ? '\\thepage' : '';
      // fancyhdr's argument parser is not long: put paragraph-bearing region
      // trees behind generated commands rather than passing literal \par tokens.
      const regionDefinitions = [
        ...(headerLayout && h ? [
          `\\newcommand{\\authoredHeader}{${h}}`,
          '\\newsavebox{\\authoredHeaderMeasure}\\sbox{\\authoredHeaderMeasure}{\\authoredHeader}',
          '\\newlength{\\authoredHeadHeight}\\setlength{\\authoredHeadHeight}{\\dimexpr\\ht\\authoredHeaderMeasure+\\dp\\authoredHeaderMeasure+4pt\\relax}',
          '\\ifdim\\authoredHeadHeight<28pt\\setlength{\\authoredHeadHeight}{28pt}\\fi',
        ] : []),
        ...(footerLayout && f ? [
          `\\newcommand{\\authoredFooter}{\\begin{minipage}[t]{160mm}${f}${pageNumber ? `\\par\\raggedleft ${pageNumber}` : ''}\\end{minipage}}`,
          '\\newsavebox{\\authoredFooterMeasure}\\sbox{\\authoredFooterMeasure}{\\authoredFooter}',
          '\\newlength{\\authoredFootSkip}\\setlength{\\authoredFootSkip}{\\dimexpr\\ht\\authoredFooterMeasure+\\dp\\authoredFooterMeasure+12pt\\relax}',
          '\\ifdim\\authoredFootSkip<24pt\\setlength{\\authoredFootSkip}{24pt}\\fi',
        ] : []),
      ].join('\n');
      return `\\documentclass[a4paper]{article}
\\usepackage{fontspec,polyglossia}
\\setdefaultlanguage{vietnamese}
\\usepackage{mathptmx}
\\setmainfont{Times New Roman}
\\setsansfont{Arial}
\\usepackage{geometry,graphicx,xcolor,fancyhdr,lastpage,hyperref,caption,booktabs,longtable,array,tabularx,amsmath,amssymb,amsthm,listings}
\\usepackage[normalem]{ulem}
${regionDefinitions}
\\geometry{a4paper,left=25mm,right=25mm,top=20mm,bottom=20mm,includeheadfoot,headheight=${headerLayout && h ? '\\authoredHeadHeight' : '28pt'},headsep=12pt,footskip=${footerLayout && f ? '\\authoredFootSkip' : '24pt'}}
\\pagestyle{fancy}\\fancyhf{}
\\fancyhead[L]{{${styleFor(header)}${headerLayout && h ? '\\authoredHeader' : h}}}
\\fancyfoot[L]{{${styleFor(footer)}${footerLayout && f ? '\\authoredFooter' : f}}}
\\fancyfoot[R]{${footerLayout && f ? '' : pageNumber}}
\\renewcommand{\\headrulewidth}{${h?'0.3':'0'}pt}
\\renewcommand{\\footrulewidth}{${f?'0.3':'0'}pt}
\\hypersetup{colorlinks=true,linkcolor=black,hypertexnames=false}
\\setcounter{tocdepth}{${Math.min(4,Math.max(1,settings.tocDepth??3))}}
${families.map(n=>`\\newtheorem{${n==='exercise'?'exer':n}}{${({theorem:'Định lý',property:'Tính chất',proposition:'Mệnh đề',corollary:'Hệ quả',lemma:'Bổ đề',exercise:'Bài toán'} as Record<string,string>)[n]}}`).join('\n')}
\\providecommand{\\subsubsubsection}[1]{\\paragraph{#1}}
\\lstset{basicstyle=\\small\\ttfamily,breaklines=true,frame=single}
\\begin{document}
${styleFor(find('paragraph'))}
${settings.explicitStructureBlocks?.length ? '' : automaticLayouts(settings)}${body}
\\end{document}
`;
    },
    renderStructureBlock(block, settings) {
      if (block==='cover') {
        if (!cover || !enabled(cover)||!settings.includeCover) return '';
        const field=(key: string,fallback='')=>escapeLatexText(textValue(cover,key,fallback));
        if (coverLayout) {
          return `\\begin{titlepage}\n\\noindent ${renderLayout(coverLayout)}\\par\n\\end{titlepage}\n`;
        }
        return `\\begin{titlepage}\n\\centering\n${styleFor(cover)}
${['university','school','faculty','reportType'].map(k=>`${field(k)}\\par\\medskip`).join('\n')}
\\vfill {\\LARGE ${field('title',settings.title)}}\\par\\bigskip
${['major','council','supervisor','secretary'].map(k=>`${field(k)}\\par\\medskip`).join('\n')}
${(settings.students??[]).map(s=>`${escapeLatexText(s.name)}\\quad ${escapeLatexText(s.id)}\\par`).join('\n')}
\\vfill ${field('locationDate')}\\par\n\\end{titlepage}\n`;
      }
      const command={toc:'tableofcontents','list-of-figures':'listoffigures','list-of-tables':'listoftables'}[block];
      const on=block==='toc'?settings.includeToc:block==='list-of-figures'?settings.includeListOfFigures:settings.includeListOfTables;
      return on?`\\clearpage\\${command}\\clearpage\n`:'';
    },
    renderBodyStart(settings) {return '\\setcounter{page}{1}\n' + automaticLayouts(settings);},
    renderThemeLayout(nodeId) {
      const current = layouts.get(nodeId);
      if (!current || !layoutWidgets.has(current.node.widget)) return undefined;
      return `\\noindent ${renderLayout(current)}\\par\n`;
    },
    renderComponent(slot,v) {
      if (/^heading-[1-4]$/.test(slot)) {
        const level=Number(slot.slice(-1));const n=nodes.find(n=>n.widget==='heading'&&Number(n.properties.level??2)===level);
        return `\\${['section','subsection','subsubsection','subsubsubsection'][level-1]}{{${styleFor(n)}${v.title}}}\n`;
      }
      if (slot==='figure') return `\\begin{figure}[${v.placement}]\\centering\\includegraphics[width=${v.width}\\textwidth]{${v.path}}\\caption{${v.caption}}${v.label}\\end{figure}\n`;
      if (slot==='table') return `\\begin{table}[${v.placement}]\\centering\n${v.body}\n\\caption{${v.caption}}${v.label}\\end{table}\n`;
      if (slot==='listing') return `\\begin{lstlisting}[${v.options}]\n${v.body}\n\\end{lstlisting}\n`;
      if (families.includes(slot)) {const e=slot==='exercise'?'exer':slot; return `\\begingroup${styleFor(find(slot))}\\begin{${e}}${v.option??''}\n${v.label??''}${v.body??''}\n\\end{${e}}\\endgroup\n`;}
      if (slot==='page-break') return '\\clearpage\n';
      if (slot==='front-section') return `\\section*${v.titleArgument}\n${v.body}\\clearpage\n`;
      return '';
    },
  };
  return {theme,snapshot,layout,rootSectionLayouts,coverLayout,headerLayout,footerLayout,errors:[]};
}
