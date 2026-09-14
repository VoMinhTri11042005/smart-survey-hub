import JSZip from 'jszip';

export type NativeChartType = 'bar' | 'column' | 'doughnut' | 'pie';

export interface NativeChartSeries {
  name: string;
  valueFormula: string;
  values: number[];
  color?: string;
  numberFormat?: string;
}

export interface NativeChartSpec {
  sheetName: string;
  type: NativeChartType;
  title: string;
  categoryFormula: string;
  categories: string[];
  series: NativeChartSeries[];
  anchor: {
    from: { col: number; row: number };
    to: { col: number; row: number };
  };
  showLegend?: boolean;
  showValues?: boolean;
  showPercent?: boolean;
  valueAxisTitle?: string;
  valueAxisNumberFormat?: string;
}

const CHART_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const MAIN_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DRAWING_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
const CHART_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
const DRAWING_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.drawing+xml';
const CHART_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';

const PIE_COLORS = ['1F4E78', '5B9BD5', '70AD47', 'ED7D31', 'A5A5A5', 'FFC000', '4472C4', 'A64D79'];
const SERIES_COLORS = ['1F4E78', '70AD47', 'ED7D31', '5B9BD5', 'A64D79', 'FFC000'];

function escapeXml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}="([^"]*)"`));
  return match ? decodeXml(match[1]) : undefined;
}

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function resolvePath(basePath: string, target: string) {
  if (target.startsWith('/')) return normalizePath(target);
  const baseDirectory = basePath.slice(0, basePath.lastIndexOf('/') + 1);
  return normalizePath(`${baseDirectory}${target}`);
}

function relationshipTarget(basePath: string, targetPath: string) {
  const baseParts = basePath.split('/');
  baseParts.pop();
  const targetParts = targetPath.split('/');
  while (baseParts.length && targetParts.length && baseParts[0] === targetParts[0]) {
    baseParts.shift();
    targetParts.shift();
  }
  return `${baseParts.map(() => '..').concat(targetParts).join('/')}`;
}

function parseRelationships(xml: string) {
  return [...xml.matchAll(/<Relationship\b[^>]*\/>/g)].map(match => ({
    id: attribute(match[0], 'Id') ?? '',
    target: attribute(match[0], 'Target') ?? '',
  }));
}

function nextRelationshipId(xml: string) {
  const ids = [...xml.matchAll(/\bId="rId(\d+)"/g)].map(match => Number(match[1]));
  return `rId${Math.max(0, ...ids) + 1}`;
}

function appendRelationship(xml: string | undefined, id: string, type: string, target: string) {
  const relationship = `<Relationship Id="${escapeXml(id)}" Type="${escapeXml(type)}" Target="${escapeXml(target)}"/>`;
  if (!xml) return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_REL_NS}">${relationship}</Relationships>`;
  if (xml.includes('/>') && /<Relationships\b[^>]*\/>/.test(xml)) {
    return xml.replace(/<Relationships\b[^>]*\/>/, `<Relationships xmlns="${PACKAGE_REL_NS}">${relationship}</Relationships>`);
  }
  return xml.replace('</Relationships>', `${relationship}</Relationships>`);
}

function addContentTypeOverride(xml: string, path: string, contentType: string) {
  const partName = `/${path}`;
  if (xml.includes(`PartName="${partName}"`)) return xml;
  return xml.replace('</Types>', `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`);
}

function richText(value: string, size = 1400, bold = true) {
  const boldAttribute = bold ? ' b="1"' : '';
  return `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr${boldAttribute} sz="${size}"><a:solidFill><a:srgbClr val="172033"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:r><a:rPr${boldAttribute} sz="${size}"><a:solidFill><a:srgbClr val="172033"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${escapeXml(value)}</a:t></a:r></a:p></c:rich></c:tx>`;
}

function categoryReference(formula: string, categories: string[]) {
  const points = categories.map((value, index) => `<c:pt idx="${index}"><c:v>${escapeXml(value)}</c:v></c:pt>`).join('');
  return `<c:strRef><c:f>${escapeXml(formula)}</c:f><c:strCache><c:ptCount val="${categories.length}"/>${points}</c:strCache></c:strRef>`;
}

function numberReference(formula: string, values: number[], numberFormat = '#,##0') {
  const points = values.map((value, index) => `<c:pt idx="${index}"><c:v>${Number.isFinite(value) ? value : 0}</c:v></c:pt>`).join('');
  return `<c:numRef><c:f>${escapeXml(formula)}</c:f><c:numCache><c:formatCode>${escapeXml(numberFormat)}</c:formatCode><c:ptCount val="${values.length}"/>${points}</c:numCache></c:numRef>`;
}

function dataLabels(showValues: boolean, showPercent: boolean) {
  if (!showValues && !showPercent) return '';
  // showLeaderLines is only valid for pie/doughnut labels in Excel's schema;
  // emitting it on bar charts makes desktop Excel offer to repair the file.
  return `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="${showValues ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${showPercent ? 1 : 0}"/>${showPercent ? '<c:showLeaderLines val="1"/>' : ''}</c:dLbls>`;
}

function chartSeries(spec: NativeChartSpec, index: number, includePoints: boolean) {
  const series = spec.series[index];
  const color = (series.color ?? SERIES_COLORS[index % SERIES_COLORS.length]).replace('#', '').toUpperCase();
  const points = includePoints
    ? series.values.map((_, pointIndex) => `<c:dPt><c:idx val="${pointIndex}"/><c:spPr><a:solidFill><a:srgbClr val="${PIE_COLORS[pointIndex % PIE_COLORS.length]}"/></a:solidFill><a:ln w="0"><a:noFill/></a:ln></c:spPr></c:dPt>`).join('')
    : '';
  return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/>${richText(series.name, 1000, false)}<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="0"><a:noFill/></a:ln></c:spPr>${points}<c:cat>${categoryReference(spec.categoryFormula, spec.categories)}</c:cat><c:val>${numberReference(series.valueFormula, series.values, series.numberFormat)}</c:val></c:ser>`;
}

function textProperties() {
  return '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="404040"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr></a:p></c:txPr>';
}

function barChartXml(spec: NativeChartSpec, chartIndex: number) {
  const categoryAxisId = 100000 + chartIndex * 2;
  const valueAxisId = categoryAxisId + 1;
  const isColumn = spec.type === 'column';
  const series = spec.series.map((_, index) => chartSeries(spec, index, false)).join('');
  const categoryAxisPosition = isColumn ? 'b' : 'l';
  const valueAxisPosition = isColumn ? 'l' : 'b';
  const valueAxisTitle = spec.valueAxisTitle ? `<c:title>${richText(spec.valueAxisTitle, 950, false)}</c:title>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="${MAIN_NS}" xmlns:r="${REL_NS}">
  <c:lang val="vi-VN"/><c:roundedCorners val="0"/>
  <c:chart>
    <c:title>${richText(spec.title, 1400, true)}<c:overlay val="0"/></c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea><c:layout/>
      <c:barChart><c:barDir val="${isColumn ? 'col' : 'bar'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>
        ${series}${dataLabels(Boolean(spec.showValues), false)}<c:gapWidth val="55"/><c:overlap val="0"/>
        <c:axId val="${categoryAxisId}"/><c:axId val="${valueAxisId}"/>
      </c:barChart>
      <c:catAx><c:axId val="${categoryAxisId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${categoryAxisPosition}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${textProperties()}<c:crossAx val="${valueAxisId}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
      <c:valAx><c:axId val="${valueAxisId}"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${valueAxisPosition}"/>${valueAxisTitle}<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D9E2F3"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${escapeXml(spec.valueAxisNumberFormat ?? '#,##0')}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${textProperties()}<c:crossAx val="${categoryAxisId}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
    </c:plotArea>
    ${spec.showLegend && spec.series.length > 1 ? `<c:legend><c:legendPos val="r"/><c:overlay val="0"/>${textProperties()}</c:legend>` : ''}
    <c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="D9E2F3"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`;
}

function doughnutChartXml(spec: NativeChartSpec) {
  const series = chartSeries(spec, 0, true);
  const isDoughnut = spec.type === 'doughnut';
  const chartTag = isDoughnut ? 'doughnutChart' : 'pieChart';
  const holeSize = isDoughnut ? '<c:holeSize val="55"/>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="${MAIN_NS}" xmlns:r="${REL_NS}">
  <c:lang val="vi-VN"/><c:roundedCorners val="0"/>
  <c:chart>
    <c:title>${richText(spec.title, 1400, true)}<c:overlay val="0"/></c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea><c:layout/><c:${chartTag}><c:varyColors val="1"/>${series}${dataLabels(false, spec.showPercent !== false)}<c:firstSliceAng val="0"/>${holeSize}</c:${chartTag}></c:plotArea>
    <c:legend><c:legendPos val="r"/><c:overlay val="0"/>${textProperties()}</c:legend>
    <c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="D9E2F3"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`;
}

function chartXml(spec: NativeChartSpec, chartIndex: number) {
  return spec.type === 'bar' || spec.type === 'column'
    ? barChartXml(spec, chartIndex)
    : doughnutChartXml(spec);
}

function drawingXml(anchors: Array<{ spec: NativeChartSpec; relationshipId: string }>) {
  const bodies = anchors.map(({ spec, relationshipId }, index) => `
  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from><xdr:col>${spec.anchor.from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${spec.anchor.from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${spec.anchor.to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${spec.anchor.to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 2}" name="Chart ${index + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${CHART_NS}"><c:chart xmlns:c="${CHART_NS}" xmlns:r="${REL_NS}" r:id="${relationshipId}"/></a:graphicData></a:graphic></xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="${MAIN_NS}" xmlns:c="${CHART_NS}" xmlns:r="${REL_NS}">${bodies}</xdr:wsDr>`;
}

function drawingRelationshipsXml(relationships: Array<{ id: string; chartPath: string }>, drawingPath: string) {
  const relationshipNodes = relationships.map(({ id, chartPath }) => `<Relationship Id="${id}" Type="${CHART_REL_TYPE}" Target="${escapeXml(relationshipTarget(drawingPath, chartPath))}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_REL_NS}">${relationshipNodes}</Relationships>`;
}

function sheetPaths(workbookXml: string, workbookRelsXml: string) {
  const relations = new Map(parseRelationships(workbookRelsXml).map(relation => [relation.id, relation.target]));
  const paths = new Map<string, string>();
  for (const sheetMatch of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = attribute(sheetMatch[0], 'name');
    const relationshipId = attribute(sheetMatch[0], 'r:id');
    if (!name || !relationshipId) continue;
    const target = relations.get(relationshipId);
    if (target) paths.set(name, resolvePath('xl/workbook.xml', target));
  }
  return paths;
}

/**
 * ExcelJS supports styling and tables but not native charts. This post-processing
 * step adds editable OOXML charts whose series remain bound to workbook cells.
 */
export async function injectNativeCharts(workbookBuffer: ArrayBuffer | Uint8Array, charts: NativeChartSpec[]) {
  if (!charts.length) return new Uint8Array(workbookBuffer);

  const zip = await JSZip.loadAsync(workbookBuffer);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  const contentTypesXml = await zip.file('[Content_Types].xml')?.async('string');
  if (!workbookXml || !workbookRelsXml || !contentTypesXml) throw new Error('Không thể tạo biểu đồ Excel: thiếu cấu trúc workbook.');

  const pathsBySheet = sheetPaths(workbookXml, workbookRelsXml);
  const grouped = new Map<string, NativeChartSpec[]>();
  for (const chart of charts) {
    if (!chart.categories.length || !chart.series.length || !pathsBySheet.has(chart.sheetName)) continue;
    grouped.set(chart.sheetName, [...(grouped.get(chart.sheetName) ?? []), chart]);
  }
  if (!grouped.size) return new Uint8Array(workbookBuffer);

  const filePaths = Object.keys(zip.files);
  let nextDrawingIndex = Math.max(0, ...filePaths.map(path => Number(path.match(/^xl\/drawings\/drawing(\d+)\.xml$/)?.[1] ?? 0))) + 1;
  let nextChartIndex = Math.max(0, ...filePaths.map(path => Number(path.match(/^xl\/charts\/chart(\d+)\.xml$/)?.[1] ?? 0))) + 1;
  let updatedContentTypes = contentTypesXml;

  for (const [sheetName, sheetCharts] of grouped) {
    const sheetPath = pathsBySheet.get(sheetName)!;
    let sheetXml = await zip.file(sheetPath)?.async('string');
    if (!sheetXml) continue;
    if (/<drawing\b/.test(sheetXml)) throw new Error(`Không thể thêm biểu đồ vì tab “${sheetName}” đã có drawing không tương thích.`);

    const drawingPath = `xl/drawings/drawing${nextDrawingIndex++}.xml`;
    const drawingRelsPath = `xl/drawings/_rels/${drawingPath.match(/drawing\d+\.xml$/)?.[0]}.rels`;
    const sheetRelsPath = `${sheetPath.slice(0, sheetPath.lastIndexOf('/'))}/_rels/${sheetPath.slice(sheetPath.lastIndexOf('/') + 1)}.rels`;
    const currentSheetRels = await zip.file(sheetRelsPath)?.async('string');
    const sheetRelationshipId = nextRelationshipId(currentSheetRels ?? '');
    const drawingRelationships: Array<{ id: string; chartPath: string }> = [];
    const anchors: Array<{ spec: NativeChartSpec; relationshipId: string }> = [];

    for (const spec of sheetCharts) {
      const chartPath = `xl/charts/chart${nextChartIndex}.xml`;
      const chartRelationshipId = `rId${drawingRelationships.length + 1}`;
      zip.file(chartPath, chartXml(spec, nextChartIndex));
      updatedContentTypes = addContentTypeOverride(updatedContentTypes, chartPath, CHART_CONTENT_TYPE);
      drawingRelationships.push({ id: chartRelationshipId, chartPath });
      anchors.push({ spec, relationshipId: chartRelationshipId });
      nextChartIndex++;
    }

    zip.file(drawingPath, drawingXml(anchors));
    zip.file(drawingRelsPath, drawingRelationshipsXml(drawingRelationships, drawingPath));
    updatedContentTypes = addContentTypeOverride(updatedContentTypes, drawingPath, DRAWING_CONTENT_TYPE);
    const updatedSheetRels = appendRelationship(currentSheetRels, sheetRelationshipId, DRAWING_REL_TYPE, relationshipTarget(sheetPath, drawingPath));
    zip.file(sheetRelsPath, updatedSheetRels);
    sheetXml = sheetXml.replace('</worksheet>', `<drawing r:id="${sheetRelationshipId}"/></worksheet>`);
    zip.file(sheetPath, sheetXml);
  }

  zip.file('[Content_Types].xml', updatedContentTypes);
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}
