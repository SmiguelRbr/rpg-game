const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');

const dev = false;
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 3000;

const gerarId = () => Math.random().toString(36).substring(2, 9);

let jogadores = {};
let slimes = [];
let faseAtual = 0;

app.prepare().then(() => {
    const expressApp = express();
    const server = http.createServer(expressApp);
    const io = new Server(server, { cors: { origin: "*" } });

    function gerarSlimesFase() {
        slimes = [];
        if (faseAtual === 0 || faseAtual === 5) return;

        let numJogadores = Math.max(1, Object.keys(jogadores).length);

        if (faseAtual <= 3) {
            let quantidade = faseAtual * 2 * numJogadores;
            for (let i = 0; i < quantidade; i++) {
                slimes.push({
                    id: gerarId(),
                    x: Math.random() * 600 + 100,
                    y: Math.random() * 400 + 100,
                    vivo: true,
                    vida: 40 * numJogadores,
                    maxVida: 40 * numJogadores,
                    isBoss: false,
                    ultimoAtaque: Date.now()
                });
            }
        } else if (faseAtual === 4) {
            slimes.push({
                id: gerarId(),
                x: 400,
                y: 300,
                vivo: true,
                vida: 1500 * numJogadores,
                maxVida: 1500 * numJogadores,
                isBoss: true,
                ultimoAtaque: Date.now()
            });
        }

        io.emit('slimesAtuais', slimes);
    }

    io.on('connection', (socket) => {
        console.log('Conectou:', socket.id);

        socket.on('entrarJogo', (dados) => {
            jogadores[socket.id] = {
                id: socket.id,
                x: 400,
                y: 300,
                nome: dados.nome,
                classe: dados.classe,
                nivel: 1,
                xp: 0,
                vida: 100,
                maxVida: 100,
                morto: false,
                direcao: 'baixo'
            };

            socket.emit('jogadoresAtuais', jogadores);
            socket.broadcast.emit('novoJogador', jogadores[socket.id]);
            socket.emit('faseAtualizada', faseAtual);

            if (slimes.length > 0) socket.emit('slimesAtuais', slimes);

            io.emit('chatNovaMensagem', {
                autor: 'SISTEMA',
                texto: `${dados.nome} entrou!`,
                cor: '#00ff00'
            });
        });

        socket.on('movimentoJogador', (dados) => {
            let jogador = jogadores[socket.id];
            if (!jogador || jogador.morto) return;

            // 🔥 anti-cheat básico
            if (Math.abs(dados.x - jogador.x) > 50) return;

            jogador.x = dados.x;
            jogador.y = dados.y;
            jogador.direcao = dados.direcao;

            socket.broadcast.emit('jogadorMoveu', jogador);
        });

        socket.on('atacarSlime', (idSlime) => {
            let jogador = jogadores[socket.id];
            let slime = slimes.find(s => s.id === idSlime);

            if (!jogador || jogador.morto || !slime || !slime.vivo) return;

            let dano = 15 + jogador.nivel * 5;
            if (jogador.classe === 'guerreiro') dano += 10;

            slime.vida -= dano;

            if (slime.vida <= 0) {
                slime.vivo = false;
                jogador.xp += slime.isBoss ? 200 : 30;

                let xpNecessario = 50 * jogador.nivel;

                if (jogador.xp >= xpNecessario) {
                    jogador.nivel++;
                    jogador.xp -= xpNecessario;
                    jogador.maxVida += 20;
                    jogador.vida = jogador.maxVida;

                    io.emit('chatNovaMensagem', {
                        autor: 'SISTEMA',
                        texto: `${jogador.nome} upou!`,
                        cor: '#ffff00'
                    });
                }

                io.emit('jogadorAtualizado', jogador);

                if (slimes.every(s => !s.vivo)) {
                    if (faseAtual < 4) {
                        faseAtual++;
                        setTimeout(() => {
                            gerarSlimesFase();
                            io.emit('faseAtualizada', faseAtual);
                        }, 2000);
                    }
                }
            }
        });

        socket.on('disconnect', () => {
            if (jogadores[socket.id]) {
                delete jogadores[socket.id];
                io.emit('jogadorDesconectado', socket.id);
            }
        });
    });

    // 🔥 LOOP OTIMIZADO
    setInterval(() => {
        let agora = Date.now();

        slimes.forEach(slime => {
            if (!slime.vivo) return;

            slime.x += (Math.random() - 0.5) * 10;
            slime.y += (Math.random() - 0.5) * 10;

            if (agora - slime.ultimoAtaque > 2000) {
                slime.ultimoAtaque = agora;
                io.emit('avisoAtaque', {
                    x: slime.x,
                    y: slime.y,
                    raio: 70
                });
            }
        });

        io.emit('slimesMovimento', slimes);

    }, 150); // 🔥 melhor que 100

    // NEXT ROUTES
    expressApp.all('*', (req, res) => {
        return handle(req, res);
    });

    server.listen(PORT, () => {
        console.log('Rodando na porta', PORT);
    });
});