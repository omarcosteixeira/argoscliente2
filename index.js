const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
require('dotenv').config(); 
const { Groq } = require('groq-sdk'); 
const puppeteer = require('puppeteer'); // Importando o Puppeteer para automação web

// Inicializa a conexão com o Groq (Llama 3)
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || "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"
});

// ====================================================================================
// 🤖 FUNÇÃO DE AUTOMAÇÃO WEB (PUPPETEER)
// ====================================================================================
async function buscarPrecoRealEstacioPuppeteer(dados) {
    console.log("Iniciando navegador invisível (Puppeteer)...");
    
    // As flags --no-sandbox são cruciais para rodar em servidores como Railway/VPS
    const browser = await puppeteer.launch({
        headless: "new", // Roda de forma invisível
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        // 1. Acessa o link com o seu código de agente
        const url = 'https://estacio.br/selecao?cod_agente=347090';
        console.log(`Acessando: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // ====================================================================================
        // ⚠️ ATENÇÃO DESENVOLVEDOR: 
        // Os seletores abaixo (ex: '#input-curso', '.btn-buscar') são EXEMPLOS DIDÁTICOS.
        // Você precisará abrir o site da Estácio no seu Chrome, clicar com o botão direito -> 
        // Inspecionar Elemento, e substituir pelos IDs ou Classes reais que o site usa hoje.
        // ====================================================================================

        /* --- EXEMPLO DE FLUXO DE PREENCHIMENTO ---
        
        // 2. Preenche o Curso
        await page.waitForSelector('#campo-curso', { timeout: 10000 });
        await page.type('#campo-curso', dados.curso, { delay: 50 });

        // 3. Seleciona o Estado e Cidade (Geralmente são Dropdowns/Selects)
        await page.select('#select-estado', dados.estado);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }), // Aguarda a página recarregar a cidade
            page.select('#select-cidade', dados.cidade)
        ]);

        // 4. Clica no botão de buscar
        await page.click('.botao-pesquisar-curso');

        // 5. Aguarda o resultado do preço carregar na tela
        await page.waitForSelector('.valor-mensalidade-destaque', { timeout: 15000 });

        // 6. Extrai o texto (o preço) do elemento HTML
        const precoExtraido = await page.$eval('.valor-mensalidade-destaque', el => el.innerText);
        const modalidadeExtraida = await page.$eval('.modalidade-texto', el => el.innerText); // Opcional
        
        return {
            sucesso: true,
            curso: dados.curso,
            modalidade: modalidadeExtraida || dados.modalidade,
            valor_com_desconto: precoExtraido,
            link_matricula: url
        };
        */

        // -------------------------------------------------------------------------
        // RETORNO SIMULADO DE SUCESSO (Remova isso quando configurar os seletores acima)
        // -------------------------------------------------------------------------
        console.log("Navegação simulada concluída (Substitua pelos seletores reais).");
        await new Promise(resolve => setTimeout(resolve, 3000)); // Simulando tempo de carregamento do bot
        
        return {
            sucesso: true,
            curso_encontrado: dados.curso,
            modalidade: dados.modalidade,
            valor_com_desconto: "R$ 159,90", // Aqui entrará a variável 'precoExtraido' do código real
            link_matricula: url
        };

    } catch (error) {
        console.error("Erro no Puppeteer:", error);
        return { sucesso: false, erro: "Falha ao extrair os dados do site da Estácio." };
    } finally {
        // OBRIGATÓRIO: Sempre fechar o navegador para não travar a memória do servidor
        await browser.close();
        console.log("Navegador fechado.");
    }
}
// ====================================================================================

async function Bot() {

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth/bot');

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.clear(); 
            console.log(`==========================================\nAPONTE O WHATSAPP PARA O QR CODE\n==========================================`);
            qrcode.generate(qr, { small: true });
            
            const linkQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
            console.log(`\n⚠️ SE O QR CODE ACIMA ESTIVER DISTORCIDO, ABRA O LINK ABAIXO NO SEU NAVEGADOR:`);
            console.log(linkQrCode);
            console.log(`==========================================`);
        }

        if (connection === 'close') {
            const erroCode = lastDisconnect?.error?.output?.statusCode;
            if (erroCode === 405) console.log("Erro 405 persistente. Tentando forçar nova versão...");
        
            const deveReconectar = erroCode !== DisconnectReason.loggedOut;
            if (deveReconectar) setTimeout(() => Bot(), 5000); 
        
        } else if (connection === 'open') console.log('--- CONEXÃO ESTABELECIDA COM SUCESSO ---');
    });
    
    flow.sock = sock;
    
    sock.ev.on("messages.upsert", async m => {

        if(m.type !== "notify") return;

        let _new = m.messages[0];
        if(!_new.message || _new.key.fromMe || _new.key.remoteJid?.endsWith("@g.us")) return;

        await flow.core({
            Jid: _new.key.remoteJid,
            msg: _new.message?.conversation ||
                 _new.message?.extendedTextMessage?.text ||
                 _new.message?.imageMessage?.caption ||
                 _new.message?.videoMessage?.caption ||
                 _new.message?.documentMessage?.caption ||
                 _new.message?.buttonsResponseMessage?.selectedButtonId ||
                 _new.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                 _new.message?.templateButtonReplyMessage?.selectedId ||
                "",
        });
    });
}; 

const flow = {

    sock: null,
    sess: {},

    async core(_user) {

        if (!_user.msg) return;

        if(!this.sess[_user.Jid]) {
            this.sess[_user.Jid] = { 
                coleta_preco: false,
                etapa_preco: 0,
                dados_preco: {}
            }; 
        };

        const sessao = this.sess[_user.Jid];
        const msgText = _user.msg.trim().toLowerCase();

        if (msgText === "#preço" || msgText === "#preco") {
            sessao.coleta_preco = true;
            sessao.etapa_preco = 1;
            sessao.dados_preco = {}; 
            
            await this.send(_user.Jid, { text: "Qual formação busca?\n(Graduação - Pós-graduação - Curso Técnico)" });
            return; 
        }

        if (!sessao.coleta_preco) {
            return; 
        }

        switch (sessao.etapa_preco) {
            case 1:
                sessao.dados_preco.formacao = _user.msg;
                sessao.etapa_preco = 2;
                await this.send(_user.Jid, { text: "Qual curso você quer fazer?" });
                return;
            case 2:
                sessao.dados_preco.curso = _user.msg;
                sessao.etapa_preco = 3;
                await this.send(_user.Jid, { text: "Qual o seu Estado?" });
                return;
            case 3:
                sessao.dados_preco.estado = _user.msg;
                sessao.etapa_preco = 4;
                await this.send(_user.Jid, { text: "Qual a sua Cidade?" });
                return;
            case 4:
                sessao.dados_preco.cidade = _user.msg;
                sessao.etapa_preco = 5;
                await this.send(_user.Jid, { text: "Qual o seu Bairro?" });
                return;
            case 5:
                sessao.dados_preco.bairro = _user.msg;
                sessao.etapa_preco = 6;
                await this.send(_user.Jid, { text: "Como você prefere estudar?\n(Presencial - Semipresencial - EAD)" });
                return;
            
            case 6:
                sessao.dados_preco.modalidade = _user.msg;
                sessao.dados_preco.ingresso = "simplificado"; 
                
                sessao.coleta_preco = false;
                sessao.etapa_preco = 0;
                
                // Aviso de que o Puppeteer vai demorar um pouquinho
                await this.send(_user.Jid, { text: "⏳ *Aguarde um momento...*\nEstou acessando o sistema da Estácio em tempo real. Isso pode levar alguns segundos..." });
                
                // ==========================================================
                // ACIONA A AUTOMAÇÃO DO PUPPETEER
                // ==========================================================
                const resultadoScraping = await buscarPrecoRealEstacioPuppeteer(sessao.dados_preco);

                if (!resultadoScraping.sucesso) {
                    await this.send(_user.Jid, { text: "❌ Poxa, o sistema da Estácio está demorando muito para responder ou bloqueou a consulta. Por favor, tente novamente mais tarde ou acesse direto pelo link: estacio.br/selecao?cod_agente=347090" });
                    return;
                }

                // ==========================================================
                // IA FORMATA O RESULTADO REAL OBTIDO PELO PUPPETEER
                // ==========================================================
                const promptRespostaReal = `O robô acabou de extrair dados reais do site da Estácio para este cliente.
                Dados extraídos:
                - Curso: ${resultadoScraping.curso_encontrado}
                - Modalidade: ${resultadoScraping.modalidade}
                - Mensalidade Extraída: ${resultadoScraping.valor_com_desconto}
                - Link do Parceiro: ${resultadoScraping.link_matricula}
                
                Crie uma mensagem muito empolgante informando que a consulta foi concluída com sucesso.
                Informe o valor exato da mensalidade e diga que para garantir essa oferta e finalizar o ingresso simplificado, ele deve clicar no Link do Parceiro.
                NÃO invente valores, use apenas os listados acima.`;

                try {
                    await this.sock.sendPresenceUpdate("composing", _user.Jid);
                    const chatCompletion = await groq.chat.completions.create({
                        messages: [{ role: "system", content: promptRespostaReal }],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.3, // Temp baixa para evitar alucinações sobre o preço
                        max_tokens: 350,
                    });
                    
                    const respostaFinal = chatCompletion.choices[0]?.message?.content;
                    await this.send(_user.Jid, { text: respostaFinal });
                    
                } catch (e) {
                    console.log("Erro na IA:", e);
                    // Fallback
                    await this.send(_user.Jid, { text: `✅ *Consulta Concluída!*\n\nValor encontrado para *${resultadoScraping.curso_encontrado}* (${resultadoScraping.modalidade}): *${resultadoScraping.valor_com_desconto}*.\n\nGaranta sua vaga acessando: ${resultadoScraping.link_matricula}` });
                }
                return; 
        }
    },

    async send(_jid, _msg = {}) {
        await this.sock.sendPresenceUpdate("composing", _jid);
        const textLength = _msg?.text?.length || 50; 
        await new Promise(resolve => setTimeout(resolve, Math.min(6000, textLength * 15)));
        await this.sock.sendMessage(_jid, _msg);
        await this.sock.sendPresenceUpdate('paused', _jid);
    },
}

Bot();
