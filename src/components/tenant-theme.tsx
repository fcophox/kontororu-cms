import {
  brandingToCssVars,
  brandingToCssVarsDark,
  serializeCssVars,
  type TenantBranding,
} from "@/lib/theme/branding";

/**
 * Server Component. Se renderiza dentro del layout del tenant, ANTES de
 * cualquier contenido, de modo que las variables llegan en el HTML inicial:
 * cero flash de colores por defecto (FOUC) y cero JS en el cliente.
 *
 * Uso:
 *   <TenantTheme branding={branding}>
 *     {children}
 *   </TenantTheme>
 */
export function TenantTheme({
  branding,
  scopeId = "tenant-scope",
  children,
}: {
  branding: TenantBranding;
  scopeId?: string;
  children: React.ReactNode;
}) {
  const light = serializeCssVars(brandingToCssVars(branding));
  const dark = serializeCssVars(brandingToCssVarsDark(branding));

  // Los valores ya vienen saneados por parseBranding() (hex y unidades CSS
  // validados con regex), por eso es seguro serializarlos a una hoja de estilo.
  const css = `
#${scopeId}{${light}}
.dark #${scopeId}, #${scopeId}.dark{${dark}}
`.trim();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div id={scopeId} className="min-h-svh bg-background text-foreground">
        {children}
      </div>
    </>
  );
}
