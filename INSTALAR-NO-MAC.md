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

## Notas fiscais automáticas, direto no gov.br (sem mensalidade)

O ERP emite a NFS-e direto no sistema nacional do governo, sem a Focus NFe e sem mensalidade.
Você só precisa do **certificado digital A1** da empresa (um arquivo `.pfx` ou `.p12` e a senha dele;
o contador costuma ter ou indicar onde comprar).

1. No ERP, vá em **Configurações**:
   - **Regime tributário** = *MEI* (ou o seu regime), CNPJ, razão social e endereço da empresa;
   - **Item LC 116 padrão** = o código do seu serviço (ex.: `17.06`). Confirme com o contador;
   - **Forma de emissão** = *Automática — direto no gov.br*;
   - **Ambiente** = *Teste* (as notas não valem nada, servem para conferir);
   - Em **Certificado digital A1**, escolha o arquivo, digite a senha e clique em **Enviar certificado**;
   - **Salvar dados da empresa**.
2. Emita uma nota de teste (em **Notas fiscais → Nova nota** ou a partir de uma conta a receber).
   Se o governo recusar, o motivo aparece em vermelho na nota. Me mande um print que eu ajusto.
3. Quando as notas de teste saírem certas, troque **Ambiente** para *Produção* e salve.
4. Para não precisar clicar em nada, ligue o **Piloto automático** (ex.: *Quando o pagamento for recebido*).

O certificado fica guardado só no seu Mac. O ERP avisa no Painel 30 dias antes de ele vencer.

## Esqueci a senha

Abra o Terminal, cole a linha abaixo e aperte **Enter**. Ela mostra os e-mails cadastrados e pede uma senha nova.
Nenhum dado é apagado.

```bash
curl -fsSL https://raw.githubusercontent.com/maragogilab-rgb/RA/HEAD/mac/redefinir-senha.sh | bash
```

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
