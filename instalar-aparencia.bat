@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "
$ErrorActionPreference = 'Stop'
Write-Host '================================' -ForegroundColor Cyan
Write-Host '  Instalando modulo Aparencia  ' -ForegroundColor Cyan
Write-Host '================================' -ForegroundColor Cyan

# ── Criar pastas ──────────────────────────────────────────────
$dirs = @(
  'src\types',
  'src\hooks',
  'src\lib',
  'src\components\aparencia',
  'src\app\(dashboard)\aparencia'
)
foreach ($d in $dirs) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  Write-Host ('  [OK] Pasta: ' + $d) -ForegroundColor Green
}

# ── ARQUIVO 1: src\types\aparencia.ts ─────────────────────────
Set-Content -Encoding UTF8 -Path 'src\types\aparencia.ts' -Value @'
export type UserRole = ''administrador'' | ''gerente'' | ''operador'' | ''caixa''
export type WatermarkType = ''logo'' | ''texto'' | ''none''
export type WatermarkPosition = ''center'' | ''footer'' | ''bottom-right''
export type IconStyle = ''padrao'' | ''netflix'' | ''soicone''

export interface BrandColors {
  primary: string
  sidebar: string
  accent: string
  menuText: string
}

export interface WatermarkConfig {
  type: WatermarkType
  customText: string
  opacity: number
  position: WatermarkPosition
  applyTo: {
    orcamentos: boolean
    ordensServico: boolean
    recibos: boolean
    relatorios: boolean
  }
}

export interface AparenciaConfig {
  id?: string
  empresa_id: string
  logo_principal_url: string | null
  logo_login_url: string | null
  cores: BrandColors
  watermark: WatermarkConfig
  icon_style: IconStyle
  nome_negocio: string
  exibir_subtitulo: boolean
  updated_at?: string
  updated_by?: string
}

export const DEFAULT_CONFIG: Omit<AparenciaConfig, ''empresa_id''> = {
  logo_principal_url: null,
  logo_login_url: null,
  cores: {
    primary: ''#7F77DD'',
    sidebar: ''#1a1a2e'',
    accent: ''#534AB7'',
    menuText: ''#ffffff'',
  },
  watermark: {
    type: ''logo'',
    customText: ''CONFIDENCIAL'',
    opacity: 18,
    position: ''center'',
    applyTo: {
      orcamentos: true,
      ordensServico: true,
      recibos: false,
      relatorios: true,
    },
  },
  icon_style: ''padrao'',
  nome_negocio: ''EMETech'',
  exibir_subtitulo: true,
}

export const ROLES_COM_ACESSO: UserRole[] = [''administrador'', ''gerente'']

export function temAcesso(role: UserRole): boolean {
  return ROLES_COM_ACESSO.includes(role)
}
'@
Write-Host '  [OK] src\types\aparencia.ts' -ForegroundColor Green

# ── ARQUIVO 2: src\hooks\useAparencia.ts ──────────────────────
Set-Content -Encoding UTF8 -Path 'src\hooks\useAparencia.ts' -Value @'
import { useState, useEffect, useCallback } from ''react''
import { createClientComponentClient } from ''@supabase/auth-helpers-nextjs''
import { AparenciaConfig, DEFAULT_CONFIG, temAcesso, UserRole } from ''../types/aparencia''

export function useAparencia(empresaId: string, userRole: UserRole) {
  const supabase = createClientComponentClient()
  const [config, setConfig] = useState<AparenciaConfig>({
    ...DEFAULT_CONFIG,
    empresa_id: empresaId,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const acesso = temAcesso(userRole)

  useEffect(() => {
    if (!empresaId) return
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from(''aparencia_config'')
        .select(''*'')
        .eq(''empresa_id'', empresaId)
        .single()
      if (data) setConfig(data as AparenciaConfig)
      if (error && error.code !== ''PGRST116'') setError(error.message)
      setLoading(false)
    }
    load()
  }, [empresaId, supabase])

  const salvar = useCallback(
    async (partial?: Partial<AparenciaConfig>) => {
      if (!acesso) { setError(''Sem permissao para alterar aparencia.''); return false }
      setSaving(true); setError(null)
      const payload = { ...config, ...partial, empresa_id: empresaId }
      const { error } = await supabase
        .from(''aparencia_config'')
        .upsert(payload, { onConflict: ''empresa_id'' })
      if (error) { setError(error.message); setSaving(false); return false }
      if (partial) setConfig(prev => ({ ...prev, ...partial }))
      setSaving(false)
      return true
    },
    [config, empresaId, acesso, supabase]
  )

  const uploadLogo = useCallback(
    async (file: File, tipo: ''principal'' | ''login''): Promise<string | null> => {
      if (!acesso) return null
      const ext = file.name.split(''.'').pop()
      const path = `${empresaId}/${tipo}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from(''logos'')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) { setError(uploadError.message); return null }
      const { data } = supabase.storage.from(''logos'').getPublicUrl(path)
      return data.publicUrl
    },
    [empresaId, acesso, supabase]
  )

  const removerLogo = useCallback(
    async (tipo: ''principal'' | ''login'') => {
      if (!acesso) return
      const field = tipo === ''principal'' ? ''logo_principal_url'' : ''logo_login_url''
      await salvar({ [field]: null })
    },
    [acesso, salvar]
  )

  return { config, setConfig, loading, saving, error, acesso, salvar, uploadLogo, removerLogo }
}
'@
Write-Host '  [OK] src\hooks\useAparencia.ts' -ForegroundColor Green

# ── ARQUIVO 3: src\lib\applyBrandConfig.ts ────────────────────
Set-Content -Encoding UTF8 -Path 'src\lib\applyBrandConfig.ts' -Value @'
import type { AparenciaConfig } from ''../types/aparencia''

export function applyBrandConfig(config: AparenciaConfig) {
  if (typeof window === ''undefined'') return
  const root = document.documentElement
  root.style.setProperty(''--brand-primary'',   config.cores.primary)
  root.style.setProperty(''--brand-sidebar'',   config.cores.sidebar)
  root.style.setProperty(''--brand-accent'',    config.cores.accent)
  root.style.setProperty(''--brand-menu-text'', config.cores.menuText)
  if (config.logo_principal_url) {
    root.style.setProperty(''--brand-logo-url'', `url(${config.logo_principal_url})`)
  }
}

export function getWatermarkStyle(watermark: AparenciaConfig[''watermark''], logoUrl?: string | null) {
  if (watermark.type === ''none'') return null
  const opacity = watermark.opacity / 100
  const positionMap = {
    center:         { top: ''50%'', left: ''50%'', transform: ''translate(-50%, -50%) rotate(-30deg)'' },
    footer:         { bottom: ''20px'', left: ''50%'', transform: ''translateX(-50%) rotate(0deg)'' },
    ''bottom-right'': { bottom: ''16px'', right: ''16px'', transform: ''rotate(-15deg)'' },
  }
  const pos = positionMap[watermark.position]
  return {
    container: { position: ''absolute'' as const, pointerEvents: ''none'' as const, zIndex: 0, ...pos },
    text: { opacity, fontSize: watermark.type === ''texto'' ? ''48px'' : undefined, fontWeight: 700, color: ''#7F77DD'', letterSpacing: ''4px'', userSelect: ''none'' as const, whiteSpace: ''nowrap'' as const },
    content: watermark.type === ''texto'' ? watermark.customText : logoUrl ?? ''MARCA'',
    isLogo: watermark.type === ''logo'',
    logoUrl,
    opacity,
  }
}
'@
Write-Host '  [OK] src\lib\applyBrandConfig.ts' -ForegroundColor Green

# ── ARQUIVO 4: src\components\aparencia\AparenciaPage.tsx ─────
Set-Content -Encoding UTF8 -Path 'src\components\aparencia\AparenciaPage.tsx' -Value @'
''use client''

import { useState } from ''react''
import { useAparencia } from ''../../hooks/useAparencia''
import { UserRole } from ''../../types/aparencia''
import TabLogos from ''./TabLogos''
import TabCores from ''./TabCores''
import TabMarcaDAgua from ''./TabMarcaDAgua''
import TabIcones from ''./TabIcones''

interface Props { empresaId: string; userRole: UserRole }

const TABS = [
  { key: ''logo'',   label: ''Logomarca'' },
  { key: ''cores'',  label: ''Cores do sistema'' },
  { key: ''marca'',  label: "Marca d'agua" },
  { key: ''icones'', label: ''Icones e nome'' },
] as const
type TabKey = (typeof TABS)[number][''key'']

export default function AparenciaPage({ empresaId, userRole }: Props) {
  const [tab, setTab] = useState<TabKey>(''logo'')
  const [toast, setToast] = useState(false)
  const hook = useAparencia(empresaId, userRole)

  const showToast = () => { setToast(true); setTimeout(() => setToast(false), 2500) }
  const handleSalvar = async (partial?: Parameters<typeof hook.salvar>[0]) => {
    const ok = await hook.salvar(partial)
    if (ok) showToast()
  }

  if (!hook.acesso) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-muted-foreground">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        <p className="text-sm">Acesso restrito a Administradores e Gerentes.</p>
      </div>
    )
  }

  if (hook.loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <div className="bg-background border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Aparencia e Marca</h1>
        <span className="text-xs px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">
          {userRole === ''administrador'' ? ''Administrador'' : ''Gerente''}
        </span>
      </div>
      <div className="bg-background border-b px-6 flex gap-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? ''border-violet-500 text-foreground'' : ''border-transparent text-muted-foreground hover:text-foreground''
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {hook.error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{hook.error}</div>
      )}
      <div className="p-6 flex flex-col gap-5 max-w-3xl">
        {tab === ''logo''   && <TabLogos      hook={hook} onSalvar={handleSalvar} />}
        {tab === ''cores''  && <TabCores      hook={hook} onSalvar={handleSalvar} />}
        {tab === ''marca''  && <TabMarcaDAgua hook={hook} onSalvar={handleSalvar} />}
        {tab === ''icones'' && <TabIcones     hook={hook} onSalvar={handleSalvar} />}
      </div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-violet-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg flex items-center gap-2">
          Alteracoes salvas com sucesso!
        </div>
      )}
    </div>
  )
}
'@
Write-Host '  [OK] src\components\aparencia\AparenciaPage.tsx' -ForegroundColor Green

# ── ARQUIVO 5: src\components\aparencia\TabLogos.tsx ──────────
Set-Content -Encoding UTF8 -Path 'src\components\aparencia\TabLogos.tsx' -Value @'
''use client''
import { useRef, useState } from ''react''
import { AparenciaConfig } from ''../../types/aparencia''
import { useAparencia } from ''../../hooks/useAparencia''

interface Props {
  hook: ReturnType<typeof useAparencia>
  onSalvar: (partial?: Partial<AparenciaConfig>) => Promise<void>
}

export default function TabLogos({ hook, onSalvar }: Props) {
  const { config, setConfig, uploadLogo, removerLogo, saving } = hook
  const inputPrincipal = useRef<HTMLInputElement>(null)
  const inputLogin = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<''principal'' | ''login'' | null>(null)

  async function handleUpload(file: File, tipo: ''principal'' | ''login'') {
    setUploading(tipo)
    const url = await uploadLogo(file, tipo)
    if (url) {
      const field = tipo === ''principal'' ? ''logo_principal_url'' : ''logo_login_url''
      setConfig(prev => ({ ...prev, [field]: url }))
      await onSalvar({ [field]: url })
    }
    setUploading(null)
  }

  return (
    <>
      <div className="flex gap-2 items-start p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
        <span>Fundo sempre <strong>transparente</strong> — use PNG ou SVG sem background.</span>
      </div>
      <div className="bg-background border rounded-xl p-5">
        <p className="font-medium text-sm mb-1">Logo principal do sistema</p>
        <p className="text-xs text-muted-foreground mb-4">Exibida no topo do menu lateral. Fundo transparente.</p>
        <div className="flex gap-4 items-start">
          <button onClick={() => inputPrincipal.current?.click()}
            className="w-44 h-24 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-violet-400 transition-all cursor-pointer">
            {config.logo_principal_url
              ? <img src={config.logo_principal_url} alt="Logo principal" className="max-w-[130px] max-h-[60px] object-contain" />
              : <span className="text-xs text-muted-foreground">Clique para enviar</span>}
          </button>
          <input ref={inputPrincipal} type="file" accept="image/png,image/svg+xml,image/webp" className="hidden"
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], ''principal'')} />
          <div className="flex flex-col gap-2 pt-1">
            <button onClick={() => inputPrincipal.current?.click()} disabled={uploading === ''principal''}
              className="text-xs border rounded px-3 py-1.5 hover:bg-muted">
              {uploading === ''principal'' ? ''Enviando...'' : ''Enviar arquivo''}
            </button>
            {config.logo_principal_url && (
              <button onClick={() => removerLogo(''principal'')} className="text-xs border border-red-200 text-red-600 rounded px-3 py-1.5 hover:bg-red-50">
                Remover logo
              </button>
            )}
            <span className="text-[11px] text-muted-foreground">PNG, SVG, WebP</span>
          </div>
        </div>
      </div>
      <div className="bg-background border rounded-xl p-5">
        <p className="font-medium text-sm mb-1">Logo da tela de login</p>
        <p className="text-xs text-muted-foreground mb-4">Exibida na tela de autenticacao.</p>
        <div className="flex gap-4 items-start">
          <button onClick={() => inputLogin.current?.click()}
            className="w-52 h-28 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-violet-400 transition-all cursor-pointer bg-muted/20">
            {config.logo_login_url
              ? <img src={config.logo_login_url} alt="Logo login" className="max-w-[160px] max-h-[80px] object-contain" />
              : <><span className="text-xs text-muted-foreground">Nenhuma logo de login</span><span className="text-xs text-muted-foreground">Clique para enviar</span></>}
          </button>
          <input ref={inputLogin} type="file" accept="image/png,image/svg+xml,image/webp" className="hidden"
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], ''login'')} />
          <div className="flex flex-col gap-2 pt-1">
            <button onClick={() => inputLogin.current?.click()} disabled={uploading === ''login''}
              className="text-xs border rounded px-3 py-1.5 hover:bg-muted">
              {uploading === ''login'' ? ''Enviando...'' : ''Enviar arquivo''}
            </button>
            {config.logo_login_url && (
              <button onClick={() => removerLogo(''login'')} className="text-xs border border-red-200 text-red-600 rounded px-3 py-1.5 hover:bg-red-50">Remover</button>
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => onSalvar()} disabled={saving}
          className="bg-violet-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {saving ? ''Salvando...'' : ''Salvar logos''}
        </button>
      </div>
    </>
  )
}
'@
Write-Host '  [OK] src\components\aparencia\TabLogos.tsx' -ForegroundColor Green

# ── ARQUIVO 6: src\components\aparencia\TabCores.tsx ──────────
Set-Content -Encoding UTF8 -Path 'src\components\aparencia\TabCores.tsx' -Value @'
''use client''
import { AparenciaConfig, BrandColors, DEFAULT_CONFIG } from ''../../types/aparencia''
import { useAparencia } from ''../../hooks/useAparencia''

interface Props {
  hook: ReturnType<typeof useAparencia>
  onSalvar: (partial?: Partial<AparenciaConfig>) => Promise<void>
}

const COLOR_FIELDS: { key: keyof BrandColors; label: string }[] = [
  { key: ''primary'',  label: ''Cor primaria (botoes, menu ativo)'' },
  { key: ''sidebar'',  label: ''Fundo do menu lateral'' },
  { key: ''accent'',   label: ''Cor de destaque / hover'' },
  { key: ''menuText'', label: ''Cor do texto no menu'' },
]

export default function TabCores({ hook, onSalvar }: Props) {
  const { config, setConfig, saving } = hook
  const cores = config.cores

  function setCor(key: keyof BrandColors, value: string) {
    setConfig(prev => ({ ...prev, cores: { ...prev.cores, [key]: value } }))
  }

  return (
    <>
      <div className="bg-background border rounded-xl p-5">
        <p className="font-medium text-sm mb-1">Paleta de cores do sistema</p>
        <p className="text-xs text-muted-foreground mb-4">Alteracoes aplicadas em todo o sistema apos salvar.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {COLOR_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">{label}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={cores[key]} onChange={e => setCor(key, e.target.value)}
                  className="w-9 h-9 rounded-md border cursor-pointer p-0.5 bg-background" />
                <input type="text" value={cores[key]}
                  onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setCor(key, e.target.value)}
                  className="w-24 text-xs font-mono px-2 py-1.5 rounded-md border bg-muted/30" maxLength={7} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-background border rounded-xl p-5">
        <p className="font-medium text-sm mb-3">Pre-visualizacao ao vivo</p>
        <div className="rounded-xl p-3 w-52" style={{ background: cores.sidebar }}>
          <div className="flex items-center gap-2 pb-2 mb-2 border-b border-white/10">
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold" style={{ background: cores.primary }}>E</div>
            <div>
              <p className="text-xs font-semibold" style={{ color: cores.menuText }}>EMETech</p>
              <p className="text-[9px] opacity-50" style={{ color: cores.menuText }}>ERP PDV v4</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md mb-1" style={{ background: cores.primary + ''33'' }}>
            <div className="w-3.5 h-3.5 rounded-sm opacity-80" style={{ background: cores.primary }} />
            <span className="text-xs font-medium" style={{ color: cores.menuText }}>Dashboard</span>
          </div>
          {[''PDV / Caixa'', ''Orcamentos''].map(item => (
            <div key={item} className="flex items-center gap-2 px-2 py-1.5 rounded-md opacity-60">
              <div className="w-3.5 h-3.5 rounded-sm bg-white/30" />
              <span className="text-xs" style={{ color: cores.menuText }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setConfig(prev => ({ ...prev, cores: DEFAULT_CONFIG.cores }))}
          className="text-sm border rounded-lg px-4 py-2 hover:bg-muted">Restaurar padrao</button>
        <button onClick={() => onSalvar({ cores })} disabled={saving}
          className="bg-violet-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {saving ? ''Salvando...'' : ''Salvar cores''}
        </button>
      </div>
    </>
  )
}
'@
Write-Host '  [OK] src\components\aparencia\TabCores.tsx' -ForegroundColor Green

# ── ARQUIVO 7: src\components\aparencia\TabMarcaDAgua.tsx ─────
Set-Content -Encoding UTF8 -Path 'src\components\aparencia\TabMarcaDAgua.tsx' -Value @'
''use client''
import { AparenciaConfig, WatermarkConfig, WatermarkType } from ''../../types/aparencia''
import { useAparencia } from ''../../hooks/useAparencia''

interface Props {
  hook: ReturnType<typeof useAparencia>
  onSalvar: (partial?: Partial<AparenciaConfig>) => Promise<void>
}

const WM_OPTIONS: { type: WatermarkType; label: string; sub: string }[] = [
  { type: ''logo'',  label: ''Logo como marca dagua'', sub: ''Exibe a logo com transparencia'' },
  { type: ''texto'', label: ''Texto personalizado'',   sub: ''Ex: CONFIDENCIAL, RASCUNHO'' },
  { type: ''none'',  label: ''Sem marca dagua'',       sub: ''Documentos limpos'' },
]

const DOC_TOGGLES: { key: keyof WatermarkConfig[''applyTo'']; label: string }[] = [
  { key: ''orcamentos'',    label: ''Orcamentos'' },
  { key: ''ordensServico'', label: ''Ordens de Servico'' },
  { key: ''recibos'',       label: ''Recibos de pagamento'' },
  { key: ''relatorios'',    label: ''Relatorios exportados'' },
]

export default function TabMarcaDAgua({ hook, onSalvar }: Props) {
  const { config, setConfig, saving } = hook
  const wm = config.watermark

  function setWm(partial: Partial<WatermarkConfig>) {
    setConfig(prev => ({ ...prev, watermark: { ...prev.watermark, ...partial } }))
  }

  return (
    <>
      <div className="bg-background border rounded-xl p-5">
        <p className="font-medium text-sm mb-1">Marca dagua em documentos</p>
        <p className="text-xs text-muted-foreground mb-4">Adicionada automaticamente nos documentos gerados.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {WM_OPTIONS.map(opt => (
            <button key={opt.type} onClick={() => setWm({ type: opt.type })}
              className={`border-2 rounded-lg p-3 text-left transition-all ${wm.type === opt.type ? ''border-violet-500 bg-violet-50'' : ''border-border hover:border-violet-300''}`}>
              <div className="w-full h-16 bg-muted/30 rounded mb-2 flex items-center justify-center relative overflow-hidden">
                {opt.type === ''logo''  && <span className="absolute text-violet-400 font-bold text-lg opacity-20 rotate-[-30deg]">EMETech</span>}
                {opt.type === ''texto'' && <span className="absolute text-gray-500 font-bold text-xs opacity-15 rotate-[-30deg] tracking-widest">CONFIDENCIAL</span>}
                <div className="relative text-[8px] text-muted-foreground text-center leading-relaxed">
                  <div>Orcamento #001</div><div>Item A R$ 100</div>
                </div>
              </div>
              <p className="text-xs font-medium">{opt.label}</p>
              <p className="text-[11px] text-muted-foreground">{opt.sub}</p>
              {wm.type === opt.type && <span className="text-[10px] text-violet-600 font-semibold mt-1 block">Selecionado</span>}
            </button>
          ))}
        </div>
        {wm.type !== ''none'' && (
          <div className="flex flex-col gap-3 border-t pt-4">
            {wm.type === ''texto'' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Texto da marca dagua</label>
                <input type="text" value={wm.customText} onChange={e => setWm({ customText: e.target.value.toUpperCase() })}
                  className="w-full max-w-xs text-xs px-3 py-2 rounded-md border bg-background font-mono" placeholder="CONFIDENCIAL" maxLength={30} />
              </div>
            )}
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-20">Opacidade</label>
              <input type="range" min={5} max={50} value={wm.opacity} onChange={e => setWm({ opacity: Number(e.target.value) })} className="flex-1 max-w-xs" />
              <span className="text-xs font-mono font-medium w-8">{wm.opacity}%</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-20">Posicao</label>
              <select value={wm.position} onChange={e => setWm({ position: e.target.value as WatermarkConfig[''position''] })}
                className="text-xs px-2 py-1.5 rounded-md border bg-background">
                <option value="center">Centro (diagonal)</option>
                <option value="footer">Rodape centralizado</option>
                <option value="bottom-right">Canto inferior direito</option>
              </select>
            </div>
          </div>
        )}
      </div>
      <div className="bg-background border rounded-xl p-5">
        <p className="font-medium text-sm mb-3">Aplicar em</p>
        <div className="flex flex-col divide-y">
          {DOC_TOGGLES.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-2.5">
              <span className="text-sm">{label}</span>
              <button role="switch" aria-checked={wm.applyTo[key]}
                onClick={() => setWm({ applyTo: { ...wm.applyTo, [key]: !wm.applyTo[key] } })}
                className={`relative w-10 h-5 rounded-full transition-colors ${wm.applyTo[key] ? ''bg-violet-500'' : ''bg-muted-foreground/30''}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${wm.applyTo[key] ? ''translate-x-5'' : ''translate-x-0''}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => onSalvar({ watermark: wm })} disabled={saving}
          className="bg-violet-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {saving ? ''Salvando...'' : ''Salvar marca dagua''}
        </button>
      </div>
    </>
  )
}
'@
Write-Host '  [OK] src\components\aparencia\TabMarcaDAgua.tsx' -ForegroundColor Green

# ── ARQUIVO 8: src\components\aparencia\TabIcones.tsx ─────────
Set-Content -Encoding UTF8 -Path 'src\components\aparencia\TabIcones.tsx' -Value @'
''use client''
import { AparenciaConfig, IconStyle } from ''../../types/aparencia''
import { useAparencia } from ''../../hooks/useAparencia''

interface Props {
  hook: ReturnType<typeof useAparencia>
  onSalvar: (partial?: Partial<AparenciaConfig>) => Promise<void>
}

const STYLES: { key: IconStyle; label: string; desc: string }[] = [
  { key: ''padrao'',  label: ''Padrao'',   desc: ''Icone + texto na mesma linha'' },
  { key: ''netflix'', label: ''Netflix'',  desc: ''Icone centralizado + nome abaixo'' },
  { key: ''soicone'', label: ''Compacto'', desc: ''Somente icones, sem texto'' },
]

const MENU_ITEMS = [
  { icon: ''D'', label: ''Dashboard'' },
  { icon: ''P'', label: ''PDV / Caixa'' },
  { icon: ''O'', label: ''Orcamentos'' },
]

export default function TabIcones({ hook, onSalvar }: Props) {
  const { config, setConfig, saving } = hook

  return (
    <>
      <div className="bg-background border rounded-xl p-5">
        <p className="font-medium text-sm mb-1">Estilo dos icones no menu lateral</p>
        <p className="text-xs text-muted-foreground mb-4">O estilo Netflix exibe o icone centralizado com nome abaixo.</p>
        <div className="grid grid-cols-3 gap-3">
          {STYLES.map(s => (
            <button key={s.key} onClick={() => setConfig(prev => ({ ...prev, icon_style: s.key }))}
              className={`border-2 rounded-lg p-3 text-left transition-all ${config.icon_style === s.key ? ''border-violet-500 bg-violet-50'' : ''border-border hover:border-violet-300''}`}>
              <div className="bg-[#1a1a2e] rounded-md p-2 mb-2 flex items-center justify-center min-h-[52px]">
                {s.key === ''padrao'' && (
                  <div className="flex flex-col gap-1 w-full">
                    {MENU_ITEMS.slice(0,2).map(item => (
                      <div key={item.label} className="flex items-center gap-1.5 px-1">
                        <span className="text-[10px] text-violet-300 font-bold">{item.icon}</span>
                        <span className="text-[9px] text-white/70">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {s.key === ''netflix'' && (
                  <div className="flex gap-3 justify-center">
                    {MENU_ITEMS.map(item => (
                      <div key={item.label} className="flex flex-col items-center gap-0.5">
                        <span className="text-[14px] text-violet-300 font-bold">{item.icon}</span>
                        <span className="text-[7px] text-white/60">{item.label.split('' '')[0]}</span>
                      </div>
                    ))}
                  </div>
                )}
                {s.key === ''soicone'' && (
                  <div className="flex gap-3 justify-center">
                    {MENU_ITEMS.map(item => <span key={item.label} className="text-[16px] text-violet-300 font-bold">{item.icon}</span>)}
                  </div>
                )}
              </div>
              <p className="text-xs font-medium">{s.label}</p>
              <p className="text-[11px] text-muted-foreground">{s.desc}</p>
              {config.icon_style === s.key && <span className="text-[10px] text-violet-600 font-semibold mt-1 block">Selecionado</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-background border rounded-xl p-5">
        <p className="font-medium text-sm mb-1">Nome do negocio no sistema</p>
        <p className="text-xs text-muted-foreground mb-3">Exibido no topo do menu lateral e na tela de login.</p>
        <input type="text" value={config.nome_negocio}
          onChange={e => setConfig(prev => ({ ...prev, nome_negocio: e.target.value }))}
          className="flex-1 max-w-xs text-sm px-3 py-2 rounded-md border bg-background" placeholder="Nome da empresa" maxLength={40} />
        <div className="mt-3 flex items-center gap-2">
          <button role="switch" aria-checked={config.exibir_subtitulo}
            onClick={() => setConfig(prev => ({ ...prev, exibir_subtitulo: !prev.exibir_subtitulo }))}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${config.exibir_subtitulo ? ''bg-violet-500'' : ''bg-muted-foreground/30''}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.exibir_subtitulo ? ''translate-x-4'' : ''translate-x-0''}`} />
          </button>
          <label className="text-sm">Exibir subtitulo (ex: ERP PDV v4)</label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => onSalvar({ icon_style: config.icon_style, nome_negocio: config.nome_negocio, exibir_subtitulo: config.exibir_subtitulo })}
          disabled={saving} className="bg-violet-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {saving ? ''Salvando...'' : ''Salvar estilo''}
        </button>
      </div>
    </>
  )
}
'@
Write-Host '  [OK] src\components\aparencia\TabIcones.tsx' -ForegroundColor Green

# ── ARQUIVO 9: src\app\(dashboard)\aparencia\page.tsx ─────────
Set-Content -Encoding UTF8 -Path 'src\app\(dashboard)\aparencia\page.tsx' -Value @'
import { createServerComponentClient } from ''@supabase/auth-helpers-nextjs''
import { cookies } from ''next/headers''
import { redirect } from ''next/navigation''
import AparenciaPage from ''@/components/aparencia/AparenciaPage''
import { UserRole } from ''@/types/aparencia''

export const metadata = { title: ''Aparencia e Marca'' }

export default async function Page() {
  const supabase = createServerComponentClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect(''/login'')

  const { data: profile } = await supabase
    .from(''profiles'')
    .select(''role'')
    .eq(''id'', session.user.id)
    .single()

  const role = (profile?.role ?? ''operador'') as UserRole

  return <AparenciaPage empresaId={session.user.id} userRole={role} />
}
'@
Write-Host '  [OK] src\app\(dashboard)\aparencia\page.tsx' -ForegroundColor Green

Write-Host ''
Write-Host '================================' -ForegroundColor Cyan
Write-Host '  9 arquivos criados com sucesso!' -ForegroundColor Green
Write-Host '================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Proximo passo: rode o SQL no Supabase' -ForegroundColor Yellow
Write-Host '(arquivo migration.sql do ZIP anterior)' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Depois: git add . && git commit -m feat: modulo aparencia && git push' -ForegroundColor Yellow
Write-Host ''
pause
"
