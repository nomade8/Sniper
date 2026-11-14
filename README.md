# Highland — Sniper de precisão

Jogo de treino de tiro em primeira pessoa com React, TypeScript, React Three Fiber e Three.js. O cenário usa metros como unidade e ocupa **1.000 × 1.000 metros**.

## Executar

```powershell
# Instala as dependências e executa o projeto quando necessário.
npm install
npm run dev
```

Se o servidor já estiver rodando nesta pasta, use a página existente. `npm run build` verifica os tipos e gera a versão de produção; `npm run check` verifica os tipos.

## Publicar no GitHub Pages

O workflow em `.github/workflows/deploy.yml` instala as dependências com `npm ci`, verifica os tipos, gera a versão de produção e publica o jogo no GitHub Pages a cada envio para `main`. Também pode ser executado manualmente na aba **Actions**.

No repositório do GitHub, abra **Settings → Pages** e selecione **GitHub Actions** em **Source**. Após a execução do workflow, o endereço do jogo aparece nessa página e no resultado da etapa de publicação.

O Vite gera caminhos relativos para que o jogo funcione também no endereço de um repositório, como `https://USUARIO.github.io/highland-sniper/`. As pastas de dependências, produção e arquivos temporários ficam fora do versionamento.

## Controles

| Controle | Ação |
| --- | --- |
| Mouse | Girar a câmera no posto fixo da montanha |
| Clique esquerdo | Atirar |
| Clique direito | Alternar mira telescópica |
| Roda do mouse, com a mira aberta | Zoom 4×, 8× ou 12× |
| Shift pressionado | Segurar a respiração por até aproximadamente 6,7 segundos |
| H | Alternar indicadores dos alvos |
| F | Abrir ajuda e pausar |
| Esc | Pausar e liberar o mouse |

Clique em **Assumir posição** para o navegador capturar o mouse. O jogo foi feito para computador com mouse e aceleração de hardware.

## Cenário e regras

- Cidade com prédios, ruas, carros e pessoas percorrendo as quadras.
- Duas florestas com pessoas caminhando entre as árvores: quatro alvos na direita e três na esquerda.
- Quantidade de árvores reduzida em aproximadamente 25% em cada floresta, mantendo colisões e percursos alinhados ao cenário.
- Torre de observação, acampamento, lago e aerogeradores.
- Rifle M24 visível em primeira pessoa, sem corpo ou braços do atirador.
- 12 alvos com forma humana por rodada: cinco na cidade e sete nas florestas, todos móveis, com braços e pernas animados.
- Posições iniciais, percursos, velocidades e roupas sorteados ao abrir o jogo e a cada nova operação.
- Percursos contornam prédios, carros e troncos, alternando janelas de visão e trechos encobertos.
- Cada alvo alterna 6–13 segundos de caminhada com 2–6 segundos parado, em ritmos diferentes; braços e pernas repousam nas pausas.
- Árvores e prédios bloqueiam disparos; indicadores dos alvos desaparecem quando corpo e cabeça estão encobertos.
- Munição infinita, sem recarga; intervalo de 0,9 segundo entre disparos.
- Projéteis percorrem o cenário em tempo real: 400 m levam cerca de 0,49 segundo e 700 m cerca de 0,85 segundo.
- Acerto, pontuação, som e impacto aparecem somente quando o projétil chega; alvos móveis exigem antecipar o movimento.
- Queda da bala, vento com velocidade de 0,6–3,6 m/s e direção sorteadas a cada rodada, distância da mira, oscilação lenta e orgânica da respiração e recuo.
- O vento permanece constante ao pausar e continuar; o painel mostra para onde ele sopra, com velocidade, graus e seta maiores na mira telescópica.
- Shift reduz suavemente a oscilação; soltar a tecla devolve o movimento natural.
- Zeragem a 300 m e velocidade inicial de 820 m/s. O vento é uma aproximação de jogabilidade.
- Pontuação por acerto, distância, centro do alvo e alvos móveis. Precisão e tempo ao terminar.
- Pausa ao perder o foco. A nova operação altera a distribuição dos alvos.

## Ajustes principais

Em `src/world.ts`: `WORLD_SIZE`, `BULLET_SPEED`, `GRAVITY`, `ZERO_DISTANCE`, `SHOT_INTERVAL`, `SCOPE_SWAY_STRENGTH`, `OBSERVER`, `heightAt` e `makeTargets`.

Em `src/ballistics.ts`: integração do projétil, limite de voo e colisões durante o trajeto.

Em `src/Game.tsx`: sensibilidade do mouse, duração entre disparos, efeito do vento e oscilação da mira.

Em `src/world.ts`: árvores em `TREES`, rotas em `makeTargets` e movimento em `targetPosition`.

Em `src/Environment.tsx`: representação das árvores, iluminação e materiais.

Árvores, janelas, pedras e marcações usam instâncias para reduzir chamadas de desenho. A interface atualiza em frequência limitada e a balística calcula colisões somente enquanto existem projéteis em voo. A pausa congela os alvos e os projéteis. Modelos e retículo são gerados pelo código; o disparo usa `src/assets/audio/shot_gun.mp3` com cauda curta e filtro para um som mais seco, e o acerto combina ruído curto com uma batida grave sintetizada. As fontes web têm alternativas locais.

## Ideias para próximas versões

1. **Vento variável e bandeiras no cenário:** observar o ambiente para estimar a compensação do tiro.
2. **Contratos de precisão:** atingir um alvo específico, acertar o centro ou concluir com munição limitada.
3. **Clima e horário:** amanhecer, neblina e chuva alterando visibilidade e dificuldade.
4. **Replay do último tiro:** mostrar a trajetória e o ponto de impacto para aprender com os erros.
5. **Alvos que aparecem por poucos segundos:** janelas, veículos e trilhas.
6. **Progressão local:** salvar recordes e liberar miras, rifles e novos postos de observação.
7. **Ajuste manual de zeragem:** torres da mira com regulagem em miliradianos.
8. **Modo desempenho:** qualidade de sombras, densidade da floresta e resolução ajustáveis.

O projeto atual usa figuras humanas em movimento. A câmera permanece no posto de observação.
