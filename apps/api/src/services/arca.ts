import crypto from 'node:crypto';
import { getRawSetting } from './settings.js';

export type CbteTipo = 'A' | 'B' | 'C';

const ENDPOINTS = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
} as const;

const CBTE_TIPO: Record<CbteTipo, number> = { A: 1, B: 2, C: 6 };

export interface ArcaConfig {
  cuit: string;
  ptoVta: number;
  entorno: 'homologacion' | 'produccion';
  certPem: string;
  keyPem: string;
  hasCert: boolean;
  hasKey: boolean;
}

export interface ArcaEmitResult {
  numero: number;
  ptoVta: number;
  tipo: CbteTipo;
  cae: string;
  venc: string;
  mode: 'real';
}

/* ===================== DER / PKCS#7 ===================== */
function readLen(buf: Buffer, off: number): [number, number] {
  const b = buf[off]!;
  if (b & 0x80) {
    const n = b & 0x7f;
    let l = 0;
    for (let i = 0; i < n; i++) l = (l << 8) | buf[off + 1 + i]!;
    return [l, off + 1 + n];
  }
  return [b, off + 1];
}

function tlvs(buf: Buffer): { tag: number; bytes: Buffer }[] {
  const out: { tag: number; bytes: Buffer }[] = [];
  let off = 0;
  while (off < buf.length) {
    const tag = buf[off]!;
    const [len, hdr] = readLen(buf, off + 1);
    out.push({ tag, bytes: buf.subarray(off, hdr + len) });
    off = hdr + len;
  }
  return out;
}

function der(tag: number, parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  let lb: Buffer;
  if (body.length < 0x80) lb = Buffer.from([body.length]);
  else if (body.length < 0x100) lb = Buffer.from([0x81, body.length]);
  else lb = Buffer.from([0x82, (body.length >> 8) & 0xff, body.length & 0xff]);
  return Buffer.concat([Buffer.from([tag]), lb, body]);
}

const OID = {
  data: '2a864886f70d010701',
  signedData: '2a864886f70d010702',
  sha1: '2a864886f70d010504',
  contentType: '2a864886f70d010901',
  msgDigest: '2a864886f70d010904',
  signingTime: '2a864886f70d010905',
  rsaEnc: '2a864886f70d010101',
};
const oid = (h: string) => Buffer.from(h, 'hex');
const utctime = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    String(d.getUTCFullYear()).slice(2) +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds()) +
    'Z'
  );
};

function tbsParts(certDer: Buffer): { serial: Buffer; issuer: Buffer } {
  const cert = tlvs(certDer)[0]!;
  const [clen, chdr] = readLen(cert.bytes, 1);
  const tbs = tlvs(cert.bytes.subarray(chdr, chdr + clen));
  let i = 0;
  if (tbs[0]!.tag === 0xa0) i = 1;
  const serial = tbs[i]!;
  const issuer = tbs[i + 2]!;
  return { serial: serial.bytes, issuer: issuer.bytes };
}

export function signCms(xml: string, certPem: string, keyPem: string): Buffer {
  const x = new crypto.X509Certificate(certPem);
  const certDer = x.raw;
  const { serial, issuer } = tbsParts(certDer);
  const digest = crypto.createHash('sha1').update(Buffer.from(xml, 'utf8')).digest();

  const attrCT = der(0x30, [oid(OID.contentType), der(0x31, [oid(OID.data)])]);
  const attrMD = der(0x30, [oid(OID.msgDigest), der(0x31, [der(0x04, [digest])])]);
  const attrST = der(0x30, [oid(OID.signingTime), der(0x31, [der(0x17, [Buffer.from(utctime(new Date()))])])]);
  const attrSet = der(0x31, [attrCT, attrMD, attrST]);

  const signature = crypto.sign('sha1', attrSet, keyPem);

  const signerInfo = der(0x30, [
    der(0x02, [Buffer.from([1])]),
    der(0x30, [issuer, serial]),
    der(0x30, [oid(OID.sha1), der(0x05, [])]),
    der(0xa0, [attrCT, attrMD, attrST]),
    der(0x30, [oid(OID.rsaEnc), der(0x05, [])]),
    der(0x04, [signature]),
  ]);

  const signedData = der(0x30, [
    der(0x02, [Buffer.from([1])]),
    der(0x31, [der(0x30, [oid(OID.sha1), der(0x05, [])])]),
    der(0x30, [oid(OID.data)]),
    der(0xa0, [certDer]),
    der(0x31, [signerInfo]),
  ]);

  return der(0x30, [oid(OID.signedData), der(0xa0, [signedData])]);
}

/* ===================== config ===================== */
export async function getArcaConfig(orgId: string): Promise<ArcaConfig> {
  const cuit = ((await getRawSetting(orgId, 'ARCA', 'CUIT')) || '').replace(/\D/g, '');
  const rawPto = await getRawSetting(orgId, 'ARCA', 'PUNTO_VENTA');
  const rawEnv = ((await getRawSetting(orgId, 'ARCA', 'ENVIRONMENT')) || '').toLowerCase();
  const certPem = (await getRawSetting(orgId, 'ARCA', 'CERT')) || '';
  const keyPem = (await getRawSetting(orgId, 'ARCA', 'PRIVATE_KEY')) || '';
  const hasCert = /BEGIN CERTIFICATE/.test(certPem);
  const hasKey = /BEGIN [A-Z ]*PRIVATE KEY/.test(keyPem);
  return {
    cuit,
    ptoVta: Number(rawPto || '1') || 1,
    entorno: rawEnv.includes('prod') ? 'produccion' : 'homologacion',
    certPem,
    keyPem,
    hasCert,
    hasKey,
  };
}

export async function arcaMode(orgId: string): Promise<'real' | 'mock'> {
  const cfg = await getArcaConfig(orgId);
  return cfg.hasCert && cfg.hasKey ? 'real' : 'mock';
}

/* ===================== SOAP ===================== */
async function soapPost(url: string, body: string, timeoutMs = 20000): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
      body,
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} desde ${new URL(url).host}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const unesc = (s: string) =>
  String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const tag = (xml: string, name: string): string | null => {
  const m = String(xml).match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unesc(m[1]!).trim() : null;
};

/* ===================== WSAA ===================== */
interface TaCache {
  token: string;
  sign: string;
  expiration: string;
}
const taCache = new Map<string, TaCache>();

async function getTA(orgId: string, force = false): Promise<TaCache> {
  const key = `${orgId}`;
  if (!force) {
    const cache = taCache.get(key);
    if (cache && cache.token && Date.parse(cache.expiration) - 60000 > Date.now()) return cache;
  }
  const cfg = await getArcaConfig(orgId);
  if (!cfg.hasCert || !cfg.hasKey) throw new Error('Sin certificado cargado (modo simulación)');
  const x = new crypto.X509Certificate(cfg.certPem);
  const source = x.subject.split(/\r?\n/).join(', ');
  const iso = (d: Date) => d.toISOString();
  const uid = crypto.randomInt(1, 2147483647);
  const content =
    '<loginTicketRequest version="1.0">' +
    '<header>' +
    `<source>${source.replace(/[<>&]/g, '')}</source>` +
    '<destination>wsfe</destination>' +
    `<uniqueId>${uid}</uniqueId>` +
    `<generationTime>${iso(new Date(Date.now() - 60000))}</generationTime>` +
    `<expirationTime>${iso(new Date(Date.now() + 300000))}</expirationTime>` +
    '</header>' +
    '<service>wsfe</service>' +
    '</loginTicketRequest>';

  const cms = signCms(content, cfg.certPem, cfg.keyPem).toString('base64');
  const soap =
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
    '<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>' +
    cms +
    '</wsaa:in0></wsaa:loginCms></soapenv:Body>' +
    '</soapenv:Envelope>';

  const url = ENDPOINTS[cfg.entorno].wsaa;
  const respText = await soapPost(url, soap);
  if (/Fault|faultstring/.test(respText)) {
    throw new Error('WSAA rechazó la firma: ' + (tag(respText, 'faultstring') || 'fault desconocido'));
  }
  const ret = tag(respText, 'loginCmsReturn');
  if (!ret) throw new Error('Respuesta WSAA sin loginCmsReturn');
  const token = tag(ret, 'token');
  const sign = tag(ret, 'sign');
  const expiration = tag(ret, 'expirationTime');
  if (!token || !sign || !expiration) throw new Error('TA inválido: ' + ret.slice(0, 200));
  const cache: TaCache = { token, sign, expiration };
  taCache.set(key, cache);
  return cache;
}

/* ===================== WSFE ===================== */
async function feSoap(orgId: string, cfg: ArcaConfig, operation: string, inner: string): Promise<string> {
  const ta = await getTA(orgId);
  const auth = `<Auth><Token>${ta.token}</Token><Sign>${ta.sign}</Sign><Cuit>${cfg.cuit}</Cuit></Auth>`;
  const body =
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">' +
    '<soapenv:Header/><soapenv:Body><ar:' +
    operation +
    '>' +
    auth +
    inner +
    '</ar:' +
    operation +
    '></soapenv:Body>' +
    '</soapenv:Envelope>';
  const url = ENDPOINTS[cfg.entorno].wsfe;
  const txt = await soapPost(url, body);
  if (/Fault|faultstring/.test(txt)) throw new Error(tag(txt, 'faultstring') || 'Fault ARCA');
  return txt;
}

function errores(xml: string): { errs: { code: number; msg: string }[]; obs: { code: number; msg: string }[] } {
  const errs: { code: number; msg: string }[] = [];
  const re = /<Err>\s*<Code>(\d+)<\/Code>\s*<Msg>([\s\S]*?)<\/Msg>\s*<\/Err>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) errs.push({ code: Number(m[1]!), msg: unesc(m[2]!).trim() });
  const obs: { code: number; msg: string }[] = [];
  const re2 = /<Obs>\s*<Code>(\d+)<\/Code>\s*<Msg>([\s\S]*?)<\/Msg>\s*<\/Obs>/g;
  while ((m = re2.exec(xml))) obs.push({ code: Number(m[1]!), msg: unesc(m[2]!).trim() });
  return { errs, obs };
}

async function feUltimo(orgId: string, cfg: ArcaConfig, cbteTipo: number): Promise<number> {
  const txt = await feSoap(orgId, cfg, 'FECompUltimoAutorizado', `<PtoVta>${cfg.ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>`);
  const { errs } = errores(txt);
  if (errs.length) throw new Error('ARCA: ' + errs.map((e) => `${e.code} ${e.msg}`).join(' | '));
  return Number(tag(txt, 'CbteNro')) || 0;
}

async function feAutorizar(
  orgId: string,
  cfg: ArcaConfig,
  { tipo, total, neto, iva }: { tipo: CbteTipo; total: number; neto: number; iva: number },
): Promise<ArcaEmitResult> {
  const cbteTipo = CBTE_TIPO[tipo];
  if (!cbteTipo) throw new Error('Tipo de comprobante inválido: ' + tipo);
  const ultimo = await feUltimo(orgId, cfg, cbteTipo);
  const nro = ultimo + 1;
  const now = new Date();
  const fch = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const f2 = (n: number) => Number(n).toFixed(2);
  const ivaBlock =
    (Number(iva) || 0) > 0.01
      ? `<Iva><AlicIva><Id>5</Id><BaseImp>${f2(neto)}</BaseImp><Importe>${f2(iva)}</Importe></AlicIva></Iva>`
      : '';
  const inner =
    '<FeCAEReq>' +
    `<FeCabReq><CantReg>1</CantReg><PtoVta>${cfg.ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo></FeCabReq>` +
    '<FeDetReq><FECAEDetRequest>' +
    '<Concepto>1</Concepto>' +
    '<DocTipo>96</DocTipo><DocNro>0</DocNro>' +
    `<CbteDesde>${nro}</CbteDesde><CbteHasta>${nro}</CbteHasta>` +
    `<CbteFch>${fch}</CbteFch>` +
    `<ImpTotal>${f2(total)}</ImpTotal><ImpTotConc>0</ImpTotConc>` +
    `<ImpNeto>${f2(neto)}</ImpNeto><ImpOpEx>0</ImpOpEx><ImpTrib>0</ImpTrib>` +
    `<ImpIVA>${f2(iva)}</ImpIVA>` +
    '<MonId>PES</MonId><MonCotiz>1</MonCotiz>' +
    ivaBlock +
    '</FECAEDetRequest></FeDetReq>' +
    '</FeCAEReq>';

  const txt = await feSoap(orgId, cfg, 'FECAESolicitar', inner);
  const { errs, obs } = errores(txt);
  const cae = tag(txt, 'CAE');
  const resultado = tag(txt, 'Resultado');
  if (resultado !== 'A' || !cae) {
    const detail = errs.concat(obs).map((e) => `${e.code}: ${e.msg}`).join(' | ') || `Resultado ${resultado}`;
    throw new Error('ARCA no autorizó: ' + detail);
  }
  const vto = tag(txt, 'CAEFchVto') || '';
  return {
    numero: nro,
    ptoVta: cfg.ptoVta,
    tipo,
    cae,
    venc: vto ? `${vto.slice(6, 8)}/${vto.slice(4, 6)}/${vto.slice(0, 4)}` : '',
    mode: 'real',
  };
}

/** Emite un comprobante real contra ARCA. Solo debe llamarse cuando arcaMode === 'real'. */
export async function arcaEmitir(
  orgId: string,
  { tipo, total, neto, iva }: { tipo: CbteTipo; total: number; neto: number; iva: number },
): Promise<ArcaEmitResult> {
  const cfg = await getArcaConfig(orgId);
  if (!cfg.hasCert || !cfg.hasKey) throw new Error('Sin certificado/clave cargados');
  if (!cfg.cuit) throw new Error('Sin CUIT cargado (Configuración → Facturación)');
  return feAutorizar(orgId, cfg, { tipo, total, neto, iva });
}

export async function arcaTest(orgId: string): Promise<{ ok: boolean; mode: string; detail: string; cuit?: string }> {
  const cfg = await getArcaConfig(orgId);
  if (!cfg.hasCert || !cfg.hasKey) {
    return {
      ok: true,
      mode: 'mock',
      detail: 'Sin certificado cargado: la facturación usa numeración interna. Cargá certificado + clave para emitir CAE reales.',
    };
  }
  if (!cfg.cuit) return { ok: false, mode: 'real', detail: 'Falta el CUIT' };
  await getTA(orgId, true);
  return { ok: true, mode: 'real', detail: `Certificado verificado contra WSAA (${cfg.entorno})`, cuit: cfg.cuit };
}

export async function arcaDummy(orgId: string): Promise<Record<string, string | null>> {
  const cfg = await getArcaConfig(orgId);
  if (!cfg.hasCert || !cfg.hasKey) {
    return { mode: 'mock', detail: 'Modo simulado: FEDummy no aplica. Cargá certificado + clave.' };
  }
  const txt = await feSoap(orgId, cfg, 'FEDummy', '');
  return {
    mode: 'real',
    app: tag(txt, 'AppServer'),
    db: tag(txt, 'DbServer'),
    auth: tag(txt, 'AuthServer'),
  };
}

export { CBTE_TIPO };
