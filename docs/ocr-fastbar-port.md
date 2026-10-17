# OCR do Fast Bar no Pop9 ERP

O motor de visão usa a Responses API da OpenAI: GPT-6 Astra principal e GPT-5.6 Luna alternativo. Fotos usam input_image com detalhe original; PDFs usam input_file. A extração de estoque usa JSON Schema estrito. Cardápio e catálogo conservam seu contrato e validação próprios.

## Configuração

Em Conexões → IA, conecte a OpenAI para a unidade selecionada. O OCR reutiliza a credencial criptografada do Pop9 (AI_CREDENTIALS_ENCRYPTION_KEY no servidor), sem copiar a chave do Fast Bar e sem expor segredos no navegador. A conta precisa ter acesso aos modelos e créditos da API.

## Entrada no estoque

Abra Estoque → Entrada por foto ou nota. Escolha documento (nota/cupom/PDF) ou produtos (geladeira, caixas, engradados, latas e embalagens). O celular permite câmera ou galeria. A imagem é reduzida para até 2400 pixels, preservando cores para identificação de produtos; o arquivo final tem limite de 3 MB.

A IA devolve somente sugestões. Vincule cada linha a um cadastro existente e toque em Conferir entrada deste item. O formulário de compras existente confere quantidade, unidade, conversão, preço, fornecedor, lote e validade antes de gravar. Em fotos de produtos, a quantidade fica vazia para o operador digitar apenas a mercadoria nova. Caixas fechadas não são convertidas automaticamente em unidades. Uma foto da geladeira não diferencia o saldo antigo de produtos novos.

Em documentos, quantidade e preço só são sugeridos no formulário quando a unidade lida coincide com a unidade do cadastro. Não existe lançamento automático nem criação automática de produtos/fornecedores. Cada item é conferido separadamente. O OCR não implementa deduplicação fiscal pelo número da nota; confira o histórico antes de registrar novamente uma nota.

## Cardápio e catálogo

A importação existente ganha Astra e Luna na lista de modelos da unidade com OpenAI conectada. O JSON passa pela validação/sanitização existente e pela conferência antes de apply_menu_import. A extração OpenAI agora usa Responses; os outros provedores são preservados.

## Operação

As Edge Functions stock-ocr e menu-import precisam ser implantadas junto ao frontend. Ambas verificam usuário e permissão de administrador na unidade antes de acessar o cofre. A reserva de uso existente limita solicitações por unidade. Falhas temporárias, timeout e saída inválida acionam uma tentativa alternativa; chave recusada, falta de créditos e recusa do modelo interrompem a leitura.

Validação automatizada cobre o contrato Responses, alternância, autenticação, isolamento por unidade, cofre e ausência de escrita de estoque durante extração. Testes de API são simulados; a precisão visual deve ser conferida com documentos reais da unidade.
