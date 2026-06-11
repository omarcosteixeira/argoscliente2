const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
require('dotenv').config(); 
const { Groq } = require('groq-sdk'); 

// Inicializa a conexão com o Groq (Llama 3)
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || "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"
});

async function Bot() {

    // 1. BUSCAR A VERSÃO ATUALIZADA (EVITA O ERRO 405)
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth/bot');

    // Criando socket do WhatsApp
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Gerando Qrcode
        if (qr) {
            console.clear(); 
            console.log(`==========================================\nAPONTE O WHATSAPP PARA O QR CODE\n==========================================`);
            qrcode.generate(qr, { small: true });
            
            const linkQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
            console.log(`\n⚠️ SE O QR CODE ACIMA ESTIVER DISTORCIDO, ABRA O LINK ABAIXO NO SEU NAVEGADOR:`);
            console.log(linkQrCode);
            console.log(`==========================================`);
        }

        // Não houve conexão (caiu ou reiniciou)
        if (connection === 'close') {
            const erroCode = lastDisconnect?.error?.output?.statusCode;
            if (erroCode === 405) console.log("Erro 405 persistente. Tentando forçar nova versão...");
        
            const deveReconectar = erroCode !== DisconnectReason.loggedOut;
            if (deveReconectar) setTimeout(() => Bot(), 5000); 
        
        // Conectado com sucesso
        } else if (connection === 'open') console.log('--- CONEXÃO ESTABELECIDA COM SUCESSO ---');
    });
    
    flow.sock = sock;
    
    sock.ev.on("messages.upsert", async m => {

        if(m.type !== "notify") return;

        let _new = m.messages[0];
        if(!_new.message || _new.key.fromMe || _new.key.remoteJid?.endsWith("@g.us")) return;

        // Extrai o texto da mensagem do usuário
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

        if (!_user.msg) return; // Ignora mensagens vazias/áudios/figurinhas

        // Inicializa a sessão do usuário caso não exista
        if(!this.sess[_user.Jid]) {
            this.sess[_user.Jid] = { 
                coleta_preco: false,
                etapa_preco: 0,
                dados_preco: {}
            }; 
        };

        const sessao = this.sess[_user.Jid];
        const msgText = _user.msg.trim().toLowerCase();

        // Se a pessoa digitar o comando de gatilho
        if (msgText === "#preço" || msgText === "#preco") {
            sessao.coleta_preco = true;
            sessao.etapa_preco = 1;
            sessao.dados_preco = {}; // Limpa pesquisas antigas
            
            await this.send(_user.Jid, { text: "Qual formação busca?\n(Graduação - Pós-graduação - Curso Técnico)" });
            return; 
        }

        // REGRA DE OURO: SE O USUÁRIO NÃO ESTIVER NO MEIO DA PESQUISA, O BOT IGNORA A MENSAGEM COMPLETAMENTE
        if (!sessao.coleta_preco) {
            return; 
        }

        // Se estiver no funil de pesquisa, segue a ordem de perguntas
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
                sessao.dados_preco.ingresso = "simplificado"; // Preenchido automático para a IA
                
                // Encerra o fluxo de coleta para este cliente
                sessao.coleta_preco = false;
                sessao.etapa_preco = 0;
                
                await this.send(_user.Jid, { text: "⏳ *Aguarde um momento...*\nEstou simulando a pesquisa de valores no sistema com seus dados..." });
                
                // Prompt isolado exclusivo para a simulação com a IA baseada na Estácio
                const promptSimulacao = `Você é um robô de simulação. O usuário informou os seguintes dados para pesquisar um curso:
                - Formação: ${sessao.dados_preco.formacao}
                - Curso: ${sessao.dados_preco.curso}
                - Estado: ${sessao.dados_preco.estado}
                - Cidade: ${sessao.dados_preco.cidade}
                - Bairro: ${sessao.dados_preco.bairro}
                - Modalidade: ${sessao.dados_preco.modalidade}
                - Forma de Ingresso: Simplificado
                
                SIMULE uma resposta informando que a pesquisa no site foi feita. 
                Invente um valor realista para a mensalidade deste curso (entre R$ 130,00 e R$ 600,00 dependendo da formação e modalidade).
                Ao final, informe OBRIGATORIAMENTE que para garantir esse valor simulado, a pessoa deve acessar o site oficial: estacio.br/selecao?cod_agente=347090.
                Seja direto, profissional e focado nas informações coletadas. Não faça novas perguntas.`;

                try {
                    await this.sock.sendPresenceUpdate("composing", _user.Jid);
                    const chatCompletion = await groq.chat.completions.create({
                        messages: [{ role: "system", content: promptSimulacao }],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.7,
                        max_tokens: 350,
                    });
                    
                    const respostaFinal = chatCompletion.choices[0]?.message?.content || "Houve um erro na geração da IA, mas acesse o site para conferir o valor real: estacio.br/selecao?cod_agente=347090";
                    await this.send(_user.Jid, { text: respostaFinal });
                    
                } catch (e) {
                    console.log("Erro na IA:", e);
                    // Resposta de segurança caso a IA (Groq) fique fora do ar
                    await this.send(_user.Jid, { text: `✅ *Pesquisa Simulada Concluída!*\n\nValor estimado da mensalidade para *${sessao.dados_preco.curso}* (${sessao.dados_preco.modalidade}): R$ 199,00 (Ingresso Simplificado).\n\nAcesse o link oficial para garantir esse desconto: estacio.br/selecao?cod_agente=347090` });
                }
                return; 
        }
    },

    async send(_jid, _msg = {}) {
        await this.sock.sendPresenceUpdate("composing", _jid);
        
        // Simula tempo de digitação levemente proporcional ao tamanho do texto
        const textLength = _msg?.text?.length || 50; 
        await new Promise(resolve => setTimeout(resolve, Math.min(6000, textLength * 15)));

        await this.sock.sendMessage(_jid, _msg);
        await this.sock.sendPresenceUpdate('paused', _jid);
    },
}

Bot();
