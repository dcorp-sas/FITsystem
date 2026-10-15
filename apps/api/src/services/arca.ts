import crypto from 'node:crypto';
import fs from 'node:fs';
import forge from 'node-forge';
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

// Codigos de comprobante AFIP (los correctos): 1=Factura A, 6=Factura B, 11=Factura C.
const CBTE_TIPO: Record<CbteTipo, number> = { A: 1, B: 6, C: 11 };
// Notas de credito: 3=A, 8=B, 9=C. Notas de debito: 2=A, 7=B, 10=C.
const NC_TIPO: Record<CbteTipo, number> = { A: 3, B: 8, C: 9 };
const ND_TIPO: Record<CbteTipo, number> = { A: 2, B: 7, C: 10 };

export const CBTE_LABEL: Record<number, string> = {
  1: 'Factura A',
  2: 'Nota de debito A',
  3: 'Nota de credito A',
  6: 'Factura B',
  7: 'Nota de debito B',
  8: 'Nota de credito B',
  9: 'Nota de credito C',
  10: 'Nota de debito C',
  11: 'Factura C',
};

export const CONDICION_IVA_LABEL: Record<string, string> = {
  '1': 'Responsable inscripto',
  '4': 'Exento',
  '5': 'Consumidor final',
  '6': 'Monotributo',
};

const AFIP_QR_BASE = 'https://www.afip.gob.ar/fe/qr/?p=';

export interface ArcaConfig {
  enabled: boolean;
  simulate: boolean;
  cuit: string;
  ptoVta: number;
  entorno: 'homologacion' | 'produccion';
  cbteTipo: number;
  concepto: number;
  condicionReceptor: string;
  condicionEmisor: string;
  certPem: string;
  keyPem: string;
  hasCert: boolean;
  hasKey: boolean;
  certSubject: string;
  certNotAfter: string;
  certError: string | null;
}

export interface ArcaEmitResult {
  numero: number;
  ptoVta: number;
  tipo: string;
  cbteTipo: number;
  cae: string;
  venc: string;
  qrUrl: string;
  estado: 'AUTORIZADO' | 'SIMULADO';
  simulated: boolean;
  mode: 'real' | 'mock';
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
const SHROUDED_KEYBAG = '1.2.840.113549.1.12.1.3';
const KEYBAG = '1.2.840.113549.1.12.1.1';

/** Extrae certificado y clave de un archivo PKCS#12 (.p12) y los devuelve en PEM. */
function p12ToPem(buffer: Buffer, password: string): { certPem: string; keyPem: string; subject: string; notAfter: string } {
  const der = buffer.toString('binary');
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, String(password ?? ''));
  const certBagOid = String(forge.pki.oids.certBag);
  const certBags = (p12.getBags({ bagType: certBagOid })[certBagOid] ?? []) as forge.pkcs12.Bag[];
  const keyBags = [
    ...(p12.getBags({ bagType: SHROUDED_KEYBAG })[SHROUDED_KEYBAG] ?? []),
    ...(p12.getBags({ bagType: KEYBAG })[KEYBAG] ?? []),
  ] as forge.pkcs12.Bag[];
  if (!certBags.length) throw new Error('El .p12 no contiene certificados');
  const keyBag = keyBags.find((b) => b.key);
  if (!keyBag?.key) throw new Error('El .p12 no contiene la clave privada');
  const key = keyBag.key;
  let cert = certBags[0]?.cert;
  if (!cert) throw new Error('El .p12 no contiene certificados');
  for (const bag of certBags) {
    const pk = bag.cert?.publicKey as { n?: unknown } | undefined;
    if (pk?.n && key.n && String(pk.n) === String(key.n)) {
      cert = bag.cert!;
      break;
    }
  }
  const subject = (cert.subject?.attributes ?? []).map((a) => `${a.shortName ?? a.name}=${a.value}`).join(', ');
  const notAfter = cert.validity?.notAfter ? new Date(cert.validity.notAfter).toISOString() : '';
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(key),
    subject,
    notAfter,
  };
}

function certMetadata(certPem: string): { subject: string; notAfter: string } {
  try {
    const x = new crypto.X509Certificate(certPem);
    const notAfter = x.validTo ? new Date(x.validTo).toISOString() : '';
    return { subject: x.subject.split(/\r?\n/).join(', '), notAfter };
  } catch {
    return { subject: '', notAfter: '' };
  }
}

export async function getArcaConfig(orgId: string, branchId?: string | null): Promise<ArcaConfig> {
  const cfg = await loadArcaConfig(orgId);
  if (branchId) {
    const branchPto = await getRawSetting(orgId, 'ARCA', `PTO_VENTA_${branchId}`);
    if (branchPto && Number(branchPto) > 0) cfg.ptoVta = Number(branchPto);
  }
  return cfg;
}

async function loadArcaConfig(orgId: string): Promise<ArcaConfig> {
  const cuit = ((await getRawSetting(orgId, 'ARCA', 'CUIT')) || '').replace(/\D/g, '');
  const rawPto = await getRawSetting(orgId, 'ARCA', 'PUNTO_VENTA');
  const rawEnv = ((await getRawSetting(orgId, 'ARCA', 'ENVIRONMENT')) || '').toLowerCase();
  const enabled = (await getRawSetting(orgId, 'ARCA', 'ENABLED')) === 'true';
  // La facturación nunca se simula: si falta certificado/clave, se informa el error.
  const simulate = false;
  const cbteTipo = Number(await getRawSetting(orgId, 'ARCA', 'CBTE_TIPO')) || 11;
  const concepto = Number(await getRawSetting(orgId, 'ARCA', 'CONCEPTO')) || 1;
  const condicionReceptor = String((await getRawSetting(orgId, 'ARCA', 'CONDICION_RECEPTOR')) ?? '5').trim();
  const condicionEmisor = String((await getRawSetting(orgId, 'ARCA', 'CONDICION_EMISOR')) ?? '6').trim();

  let certPem = (await getRawSetting(orgId, 'ARCA', 'CERT')) || '';
  let keyPem = (await getRawSetting(orgId, 'ARCA', 'PRIVATE_KEY')) || '';
  let certSubject = '';
  let certNotAfter = '';
  let certError: string | null = null;

  const hasPem = /BEGIN CERTIFICATE/.test(certPem) && /BEGIN [A-Z ]*PRIVATE KEY/.test(keyPem);
  if (!hasPem) {
    // Formato PKCS#12: base64 en el ajuste CERT_P12, o ruta en CERT_PATH (uso local).
    const certPassword = (await getRawSetting(orgId, 'ARCA', 'CERT_PASSWORD')) || '';
    try {
      const b64 = (await getRawSetting(orgId, 'ARCA', 'CERT_P12')) || '';
      const certPath = (await getRawSetting(orgId, 'ARCA', 'CERT_PATH')) || '';
      let buffer: Buffer | null = null;
      if (b64) buffer = Buffer.from(b64.replace(/^data:[^,]*,/, ''), 'base64');
      else if (certPath && fs.existsSync(certPath)) buffer = fs.readFileSync(certPath);
      if (buffer && buffer.length) {
        const parsed = p12ToPem(buffer, certPassword);
        certPem = parsed.certPem;
        keyPem = parsed.keyPem;
        certSubject = parsed.subject;
        certNotAfter = parsed.notAfter;
      }
    } catch (err) {
      certError = (err as Error).message;
    }
  }

  const hasCert = /BEGIN CERTIFICATE/.test(certPem);
  const hasKey = /BEGIN [A-Z ]*PRIVATE KEY/.test(keyPem);
  if (hasCert) {
    try {
      const meta = certMetadata(certPem);
      certSubject = certSubject || meta.subject;
      certNotAfter = certNotAfter || meta.notAfter;
    } catch {
      /* ignore */
    }
  }

  return {
    enabled,
    simulate,
    cuit,
    ptoVta: Number(rawPto || '1') || 1,
    entorno: rawEnv.includes('prod') ? 'produccion' : 'homologacion',
    cbteTipo,
    concepto,
    condicionReceptor,
    condicionEmisor,
    certPem,
    keyPem,
    hasCert,
    hasKey,
    certSubject,
    certNotAfter,
    certError,
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
  if (!cfg.hasCert || !cfg.hasKey) throw new Error('Sin certificado cargado: no se puede facturar');
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

const f2 = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);
const pad2 = (n: number) => String(n).padStart(2, '0');
const ddmmyyyy = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Resuelve el codigo de comprobante AFIP: override por letra (A/B/C) o el configurado. */
export function resolveCbteTipo(cfg: ArcaConfig, invoiceType?: string): number {
  if (invoiceType && (invoiceType as CbteTipo) in CBTE_TIPO) return CBTE_TIPO[invoiceType as CbteTipo];
  return cfg.cbteTipo || 11;
}

/** Resuelve el codigo de NOTA DE CREDITO AFIP segun la letra del comprobante original. */
export function resolveCreditNoteTipo(cfg: ArcaConfig, invoiceType?: string): number {
  if (invoiceType && (invoiceType as CbteTipo) in NC_TIPO) return NC_TIPO[invoiceType as CbteTipo];
  const base = cfg.cbteTipo || 11;
  if (base === 1) return NC_TIPO.A;
  if (base === 6) return NC_TIPO.B;
  return NC_TIPO.C;
}

export interface ArcaComprobanteAsoc {
  tipo: number;
  ptoVta: number;
  nro: number;
  fecha?: string; // yyyymmdd
}

/** URL del QR oficial de AFIP para imprimir en el comprobante (payload JSON en base64url). */
export function afipQrUrl(p: {
  fecha: string;
  cuit: string;
  ptoVta: number;
  cbteTipo: number;
  nro: number;
  importe: number;
  tipoDocRec: number;
  nroDocRec: number;
  cae: string;
}): string {
  const data = {
    ver: 1,
    fecha: p.fecha,
    cuit: Number(p.cuit) || 0,
    ptoVta: p.ptoVta,
    tipoCmp: p.cbteTipo,
    nroCmp: p.nro,
    importe: Number(p.importe.toFixed(2)),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: p.tipoDocRec,
    nroDocRec: p.nroDocRec,
    tipoCodAut: 'E',
    codAut: Number(p.cae) || 0,
  };
  return AFIP_QR_BASE + Buffer.from(JSON.stringify(data)).toString('base64url');
}

export interface ArcaEmitOptions {
  invoiceType?: string;
  total: number;
  neto: number;
  iva: number;
  customerTaxId?: string;
  fecha?: Date;
  branchId?: string | null;
  assoc?: ArcaComprobanteAsoc;
}

async function feAutorizar(orgId: string, cfg: ArcaConfig, cbteTipo: number, opts: ArcaEmitOptions): Promise<ArcaEmitResult> {
  const ultimo = await feUltimo(orgId, cfg, cbteTipo);
  const nro = ultimo + 1;
  const fecha = opts.fecha ?? new Date();
  const fch = Number(`${fecha.getFullYear()}${pad2(fecha.getMonth() + 1)}${pad2(fecha.getDate())}`);
  const docTipo = opts.customerTaxId ? 80 : 99;
  const docNro = opts.customerTaxId ? Number(opts.customerTaxId.replace(/\D/g, '')) : 0;
  const { total, neto, iva } = opts;
  const ivaBlock = iva > 0 ? `<Iva><AlicIva><Id>5</Id><BaseImp>${f2(neto)}</BaseImp><Importe>${f2(iva)}</Importe></AlicIva></Iva>` : '';
  const condicion = cfg.condicionReceptor ? `<CondicionIVAReceptorId>${cfg.condicionReceptor}</CondicionIVAReceptorId>` : '';
  const assocBlock = opts.assoc
    ? '<CbtesAsoc><CbteAsoc>' +
      `<Tipo>${opts.assoc.tipo}</Tipo><PtoVta>${opts.assoc.ptoVta}</PtoVta><Nro>${opts.assoc.nro}</Nro>` +
      (opts.assoc.fecha ? `<CbteFch>${opts.assoc.fecha.replace(/-/g, '')}</CbteFch>` : '') +
      '</CbteAsoc></CbtesAsoc>'
    : '';
  const inner =
    '<FeCAEReq>' +
    `<FeCabReq><CantReg>1</CantReg><PtoVta>${cfg.ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo></FeCabReq>` +
    '<FeDetReq><FECAEDetRequest>' +
    `<Concepto>${cfg.concepto || 1}</Concepto>` +
    `<DocTipo>${docTipo}</DocTipo><DocNro>${docNro}</DocNro>` +
    `<CbteDesde>${nro}</CbteDesde><CbteHasta>${nro}</CbteHasta>` +
    `<CbteFch>${fch}</CbteFch>` +
    `<ImpTotal>${f2(total)}</ImpTotal><ImpTotConc>0</ImpTotConc>` +
    `<ImpNeto>${f2(neto)}</ImpNeto><ImpOpEx>0</ImpOpEx><ImpTrib>0</ImpTrib>` +
    `<ImpIVA>${f2(iva)}</ImpIVA>` +
    '<MonId>PES</MonId><MonCotiz>1</MonCotiz>' +
    ivaBlock +
    condicion +
    assocBlock +
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
    tipo: CBTE_LABEL[cbteTipo] ?? String(cbteTipo),
    cbteTipo,
    cae,
    venc: vto ? `${vto.slice(6, 8)}/${vto.slice(4, 6)}/${vto.slice(0, 4)}` : '',
    qrUrl: afipQrUrl({ fecha: ymd(fecha), cuit: cfg.cuit, ptoVta: cfg.ptoVta, cbteTipo, nro, importe: total, tipoDocRec: docTipo, nroDocRec: docNro, cae }),
    estado: 'AUTORIZADO',
    simulated: false,
    mode: 'real',
  };
}

/** Emite un comprobante real contra ARCA. Requiere certificado, clave y CUIT; no simula. */
export async function arcaEmitir(orgId: string, opts: ArcaEmitOptions): Promise<ArcaEmitResult> {
  const cfg = await getArcaConfig(orgId, opts.branchId);
  if (!cfg.hasCert || !cfg.hasKey) throw new Error('Sin certificado/clave cargados');
  if (!cfg.cuit) throw new Error('Sin CUIT cargado (Configuración → Facturación)');
  return feAutorizar(orgId, cfg, resolveCbteTipo(cfg, opts.invoiceType), opts);
}

/** Emite una NOTA DE CREDITO real (asociada al comprobante original) contra ARCA. */
export async function arcaEmitirNotaCredito(orgId: string, opts: ArcaEmitOptions): Promise<ArcaEmitResult> {
  const cfg = await getArcaConfig(orgId, opts.branchId);
  if (!cfg.hasCert || !cfg.hasKey) throw new Error('Sin certificado/clave cargados');
  if (!cfg.cuit) throw new Error('Sin CUIT cargado (Configuración → Facturación)');
  if (!opts.assoc) throw new Error('Falta el comprobante asociado (factura original)');
  return feAutorizar(orgId, cfg, resolveCreditNoteTipo(cfg, opts.invoiceType), opts);
}

export interface ArcaTestResult {
  ok: boolean;
  mode: 'real' | 'mock';
  simulate: boolean;
  detail: string;
  ambiente: 'homologacion' | 'produccion';
  cuit?: string;
  ptoVta?: number;
  cbteLabel?: string;
  condicionReceptor?: string;
  cert?: { present: boolean; subject: string; notAfter: string };
  dummy?: Record<string, string | null>;
  token?: { ok: boolean; error?: string };
  lastCbte?: number | null;
}

export async function arcaTest(orgId: string): Promise<ArcaTestResult> {
  const cfg = await getArcaConfig(orgId);
  const base: ArcaTestResult = {
    ok: true,
    mode: cfg.hasCert && cfg.hasKey ? 'real' : 'mock',
    simulate: false,
    ambiente: cfg.entorno,
    detail: '',
    cuit: cfg.cuit || undefined,
    ptoVta: cfg.ptoVta,
    cbteLabel: CBTE_LABEL[cfg.cbteTipo] ?? String(cfg.cbteTipo),
    condicionReceptor: CONDICION_IVA_LABEL[cfg.condicionReceptor] ?? cfg.condicionReceptor,
    cert: { present: cfg.hasCert && cfg.hasKey, subject: cfg.certSubject, notAfter: cfg.certNotAfter },
  };

  if (cfg.certError) return { ...base, ok: false, detail: `Error al leer el certificado: ${cfg.certError}` };
  if (!cfg.hasCert || !cfg.hasKey) {
    return { ...base, ok: false, detail: 'Sin certificado cargado: no se puede facturar. Cargá el certificado y la clave privada.' };
  }
  if (!cfg.cuit) return { ...base, ok: false, detail: 'Falta el CUIT.' };
  if (!cfg.ptoVta) return { ...base, ok: false, detail: 'Falta el punto de venta.' };

  const dummy = await arcaDummy(orgId).catch(() => ({ mode: 'real' } as Record<string, string | null>));
  try {
    await getTA(orgId, true);
  } catch (err) {
    return { ...base, ok: false, dummy, token: { ok: false, error: (err as Error).message }, detail: 'El certificado no pudo autenticar contra WSAA.' };
  }
  let lastCbte: number | null = null;
  try {
    lastCbte = await feUltimo(orgId, cfg, cfg.cbteTipo);
  } catch {
    /* ultimo opcional */
  }
  return { ...base, dummy, token: { ok: true }, lastCbte, detail: `Certificado verificado contra WSAA (${cfg.entorno}).` };
}

export async function arcaDummy(orgId: string): Promise<Record<string, string | null>> {
  const cfg = await getArcaConfig(orgId);
  if (!cfg.hasCert || !cfg.hasKey) {
    return { mode: 'mock', detail: 'Sin certificado: FEDummy no aplica. Cargá certificado + clave.' };
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
