# Usar o ERP no seu Mac (sem colocar na internet)

O ERP fica instalado **só no seu Mac**. Ninguém de fora acessa. Ele usa a internet apenas para
enviar as notas fiscais (Focus NFe) e buscar endereços pelo CEP. Não tem mensalidade de hospedagem.

## Instalar (uma vez só, cerca de 2 minutos)

1. Abra o **Terminal**: aperte **Cmd + Espaço**, digite `Terminal` e aperte **Enter**.
2. Copie a linha abaixo, cole no Terminal (**Cmd + V**) e aperte **Enter**:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/maragogilab-rgb/RA/HEAD/mac/instalar.sh | bash
   ```

3. Responda às perguntas:
   - **e-mail**: aperte **Enter** para usar `maragogilab@gmail.com` (ou digite outro);
   - **nome**: o seu nome;
   - **senha**: crie uma senha com pelo menos 8 caracteres. Ela **não aparece** enquanto você digita; é normal.
4. No fim, o ERP abre sozinho e aparece o ícone **ERP Maragogi Lab** na sua mesa.

## Usar no dia a dia

- Dê **dois cliques** no ícone **ERP Maragogi Lab** na mesa e entre com o seu e-mail e senha.
- O sistema fica ligado em segundo plano enquanto o Mac estiver ligado. Assim as **notas automáticas**
  continuam saindo mesmo com a janela fechada. Com o Mac desligado, elas saem quando você ligá-lo de novo.

## Atualizar para a versão mais nova

Rode de novo a mesma linha do passo 2. Os seus dados são mantidos.

## Onde ficam os dados (backup)

Na pasta **ERP-Maragogi-Lab → dados**, dentro da sua pasta de usuário (arquivo `erp.db`).
Se você usa o **Time Machine**, ela já entra no backup. Também dá para copiar essa pasta para um pendrive ou para o Drive.

## Desinstalar

```bash
bash ~/ERP-Maragogi-Lab/app/mac/desinstalar.sh
```

Os dados continuam guardados na pasta `ERP-Maragogi-Lab/dados`.
