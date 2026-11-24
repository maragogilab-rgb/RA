# Skills e plugins de design gráfico para o Claude

Levantamento feito no GitHub em 24/11/2026 (estrelas aproximadas na data). Ordenado por relevância para design gráfico e criação de arte.

## Skills — as melhores

| # | Skill | Repositório | ★ | Para que serve |
|---|---|---|---|---|
| 1 | **canvas-design**, **algorithmic-art**, **brand-guidelines**, **theme-factory**, **frontend-design**, **slack-gif-creator** | [anthropics/skills](https://github.com/anthropics/skills) | 200k | Oficiais da Anthropic: pôster/arte estática em PNG/PDF, arte generativa (p5.js), aplicação de marca, temas de cor+fonte, páginas bonitas, GIFs animados |
| 2 | **ui-ux-pro-max** (+ banner-design, brand, design-system, slides) | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 154k | Banco de estilos, paletas e pares de fontes; banners e marca |
| 3 | **taste-skill** | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | 121k | Direção de arte e "bom gosto", referências visuais, conferência no navegador |
| 4 | **impeccable** | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | 116k | Vocabulário de design: polir, deixar mais ousado, criticar, auditar, pegar "cara de IA" |
| 5 | **hallmark** | [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | 60k | Anti "AI slop": design com identidade |
| 6 | **huashu-design** | [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design) | 31k | Uma frase → peça entregável (protótipo, PPTX, infográfico, posts), 92 estilos (em chinês) |
| 7 | **unslop** | [heydamir/unslop](https://github.com/heydamir/unslop) | 21k | Transforma interface com cara de IA em algo desenhado |
| 8 | **remotion skills** | [remotion-dev/skills](https://github.com/remotion-dev/skills) | 8k | Vídeo e motion graphics em código (oficial Remotion) |
| 9 | **logo-design** | [kaankiziltug/logo-design-skill](https://github.com/kaankiziltug/logo-design-skill) | 7.6k | Logo: princípios, processo, SVG, testes e 1.400 referências |
| 10 | **pixelfx** | [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) | 9k | 244 efeitos de pixel art + skill para criar novos |
| 11 | **awesome-design-skills** | [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills) | 3.8k | Lista com 67 arquivos DESIGN.md/SKILL.md de design |
| 12 | **bang-motion** | [bangtutorial/bang-motion](https://github.com/bangtutorial/bang-motion) | 3k | Motion graphics no navegador, tipografia cinética, vinhetas |
| 13 | **color-expert** | [meodai/skill.color-expert](https://github.com/meodai/skill.color-expert) | 670 | Ciência da cor: OKLCH, contraste APCA/WCAG, paletas |
| 14 | **brand-identity** | [fatihaydost/brand-identity-skill](https://github.com/fatihaydost/brand-identity-skill) | 470 | Logo + tipografia + cores como sistema, com manual de marca |
| 15 | **nano-banana-2** | [kingbootoshi/nano-banana-2-skill](https://github.com/kingbootoshi/nano-banana-2-skill) | 420 | Geração de imagem com Gemini (fundo transparente, referência, estilo) |
| 16 | **claude-design-skill** | [jiji262/claude-design-skill](https://github.com/jiji262/claude-design-skill) | 225 | Designer para peças em HTML: decks, landing pages, pôsteres |
| 17 | **svg-creator** | [upbrew-tech/svg-creator-skill](https://github.com/upbrew-tech/svg-creator-skill) | 45 | Ilustrações e personagens SVG com ciclo renderizar-conferir-corrigir |
| 18 | **ai-graphic-design-skill** | [designrique/ai-graphic-design-skill](https://github.com/designrique/ai-graphic-design-skill) | 38 | Logos e identidade com IA: ferramentas, prompts, vetorização, mockups, direitos |

## Plugins, conectores e coleções

| Nome | Onde | Para que serve |
|---|---|---|
| **Figma MCP** (oficial) | [figma/mcp-server-guide](https://github.com/figma/mcp-server-guide) | Ler/criar designs no Figma, gerar imagem e ilustração vetorial |
| **Canva** (conector) | claude.ai → Conectores | Criar, editar, redimensionar e exportar designs com brand kit |
| **Adobe for creativity** (conector) | claude.ai → Conectores | Remover fundo, vetorizar, expandir imagem, fontes Adobe, Express |
| **Plugin design** (Anthropic) | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | Crítica de design, acessibilidade, design system, handoff |
| **design-pack** | [m-binimran/design-pack](https://github.com/m-binimran/design-pack) | Pacote para designers gráficos: Figma, Canva, Firefly, Unsplash, revisão |
| **LibreUIUX** | [Ormus-Solutions/LibreUIUX-Claude-Code](https://github.com/Ormus-Solutions/LibreUIUX-Claude-Code) | Marketplace com 71 plugins e 74 skills de UI/UX |
| **Frontend Design Toolkit** | [wilwaldon/Claude-Code-Frontend-Design-Toolkit](https://github.com/wilwaldon/Claude-Code-Frontend-Design-Toolkit) | Coletânea de skills, plugins e MCPs que melhoram o visual |
| **awesome-claude-skills** | [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | Lista geral de skills (80k ★) |

## O agente "designer-grafico" deste projeto

Fica em `.claude/agents/designer-grafico.md` e já carrega 9 skills próprias (em `.claude/skills/`), em português, feitas para a Maragogi Lab:

| Skill própria | Cobre |
|---|---|
| `briefing-criativo` | Briefing, mensagem única, 2–3 direções de conceito |
| `identidade-visual` | Logo, versões, manual de marca |
| `tipografia-e-cor` | Pares de fontes, escala, paletas 60-30-10, contraste |
| `layout-e-composicao` | Grade, margens, hierarquia, carrossel |
| `artes-redes-sociais` | Tamanhos de todas as redes + `render.js` (HTML → PNG/JPG/PDF) |
| `impressao-grafica` | Sangria, área segura, 300 dpi, CMYK, PDF para gráfica |
| `ilustracao-svg` | Ícones, ilustrações, padrões, arte generativa, infográficos |
| `imagem-com-ia` | Prompts, Canva/Firefly/Figma, remoção de fundo, direitos |
| `revisao-de-arte` | Checklist de qualidade e crítica |

### Como usar
1. (Opcional, recomendado) instale as skills de terceiros acima:
   ```bash
   bash scripts/instalar-skills-design.sh            # para todos os projetos (~/.claude/skills)
   bash scripts/instalar-skills-design.sh --projeto  # só neste projeto
   ```
2. Para renderizar artes localmente: `npm i -D playwright && npx playwright install chromium` (no Claude Code na nuvem já vem instalado).
3. No Claude Code, peça: *"Use o designer-grafico para criar um carrossel de 5 slides sobre …"* ou digite `/agents` para vê-lo.

> Leia a licença de cada repositório de terceiros antes de uso comercial. As skills de terceiros não ficam versionadas aqui; o script baixa direto da fonte.
