# Matar ou Morrer (React)

Este projeto é a versão React JS do jogo "Matar ou Morrer", originalmente desenvolvido em HTML/JavaScript vanilla.

---

## Sobre o Projeto

- Conversão fiel do sistema original para React, mantendo todas as funcionalidades e visual customizado.
- Utiliza Bootstrap 5 e CSS customizado para o visual clássico do jogo.
- Modularização em componentes reutilizáveis.
- Gerenciamento de estado moderno com React Hooks.

---

## Estrutura de Arquivos

```
src/
  App.js                # Componente principal
  components/
    CharacterSelection.jsx
    CharacterBuilder.jsx
    CharacterSheet.jsx
    CharacteristicCard.jsx
    SelectionSection.jsx
    Counter.jsx
  utils/
    Utils.js
public/
  GameEconomyData.json
  LocalizationPortuguese.json
  KillOrDieLogo.png
```

---

## Como Executar

### Pré-requisitos
- Node.js 14+
- npm ou yarn

### Instalação
```bash
npm install
```

### Desenvolvimento
```bash
npm start
```
Abra [http://localhost:3000](http://localhost:3000) no navegador.

### Build de Produção
```bash
npm run build
```

---

## Funcionalidades

- ✅ Seleção de personagens
- ✅ Sistema de construção de personagem
- ✅ Seleção limitada de habilidades/itens
- ✅ Sistema de modos/transformação
- ✅ Ficha de personagem interativa
- ✅ Contadores de vida, esquiva, etc.
- ✅ Botões de usar/recuperar itens
- ✅ Localização em português
- ✅ Visual clássico (Bootstrap + CSS customizado)

---

## Scripts Disponíveis

- `npm start` — Executa o app em modo desenvolvimento
- `npm test` — Executa os testes (React Testing Library)
- `npm run build` — Gera build de produção
- `npm run eject` — Eject do Create React App (irreversível)

---

## Melhorias da Versão React

- Renderização otimizada com Virtual DOM
- Código modular e reutilizável
- Separação de responsabilidades
- Hot reload durante desenvolvimento
- Fácil adição de novos componentes
- Estados de loading e feedback visual melhorado

---

## Arquivos de Dados

Os seguintes arquivos devem estar na pasta `public/`:
- `GameEconomyData.json` — Dados do jogo
- `LocalizationPortuguese.json` — Textos em português
- `KillOrDieLogo.png` — Logo do jogo

---

## Próximos Passos Recomendados

1. **TypeScript** — Converter para TypeScript para melhor tipagem
2. **Testes** — Adicionar testes unitários com Jest/React Testing Library
3. **Context API** — Para gerenciamento de estado mais complexo
4. **React Router** — Para navegação com URLs
5. **PWA** — Transformar em Progressive Web App
6. **Responsividade** — Melhorar layout mobile

---

## Compatibilidade

A aplicação React mantém 100% de compatibilidade funcional com a versão original, preservando todas as mecânicas de jogo e interface do usuário.

---

## Créditos

Este projeto foi bootstrapped com [Create React App](https://github.com/facebook/create-react-app).

Para mais informações sobre React, consulte a [documentação oficial](https://reactjs.org/).
