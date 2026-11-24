---
name: imagem-com-ia
description: Escreve prompts e conduz geração/edição de imagens com IA (Canva, Adobe Firefly, Figma, Gemini/Nano Banana, etc.), remoção de fundo, expansão e vetorização, com cuidados de direitos autorais. Usar quando a peça precisa de foto, cenário, produto ou ilustração que não existe no acervo.
---

# Imagem com IA

## Quando usar
Use IA para **cenários, texturas, fundos, ilustrações conceituais e variações**. Prefira foto real do cliente para produto, equipe, local e antes/depois — imagem gerada não pode enganar o consumidor.

## Estrutura de prompt
`[assunto] + [ação/pose] + [cenário] + [enquadramento/lente] + [luz] + [estilo/meio] + [paleta] + [espaço para texto] + [proporção]`

Exemplo: "Coqueiros e piscina natural de água turquesa na maré baixa, vista aérea de drone em 45°, luz dourada do fim de tarde, fotografia editorial realista, tons de turquesa e areia, terço superior com céu limpo para título, proporção 4:5".

- Peça **espaço negativo** onde o texto vai entrar.
- Não peça texto dentro da imagem — coloque a tipografia depois, em HTML/SVG.
- Gere 4 variações, escolha 1, refine com edição localizada.

## Ferramentas (use a que estiver conectada)
| Tarefa | Opções |
|---|---|
| Gerar imagem | `mcp__Canva__generate-image`, `mcp__Figma__generate_image`, Firefly, Gemini |
| Remover fundo | `mcp__Adobe_for_creativity__image_remove_background`, `mcp__Canva__remove-background` |
| Expandir / preencher área | `image_generative_expand`, `image_fill_area` (Adobe) |
| Vetorizar | `image_vectorize` (Adobe) |
| Ajustes | `image_apply_adjustments`, `image_apply_auto_tone` (Adobe) |

Carregue as ferramentas com ToolSearch antes de usar. Sem nenhuma conectada, monte a arte com tipografia, formas e SVG (é o caminho mais seguro e muitas vezes o mais bonito).

## Direitos e ética
- Nada de estilo "à maneira de [artista vivo]", logos, personagens ou marcas registradas de terceiros.
- Pessoas reais só com autorização; não gere rostos de pessoas identificáveis.
- Guarde o prompt usado no `LEIAME.md` da entrega.
- Fotos de banco: Unsplash/Pexels (licença livre) — registre o link da origem.
