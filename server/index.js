import express from 'express'
import logger from "morgan"
import dotenv from 'dotenv'
import {createClient} from '@libsql/client'
import {Server} from 'socket.io'
import {createServer} from 'node:http'

//Para usar variables de entorno
dotenv.config()

const port = process.env.PORT ?? 3000

const app = express()
const server = createServer(app)
const io = new Server(server,{
    connectionStateRecovery: {}
})

const db = createClient({
    url:'tursoLinkHere',
    authToken: process.env.DB_TOKEN
})

await db.execute(`
    CREATE TABLE IF NOT EXISTS messages(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        user TEXT
    )
`)

io.on('connection', async (socket) => {
    console.log('a user has connected!')
  
    socket.on('disconnect', () => {
      console.log('an user has disconnected')
    })
  
    socket.on('chat message', async (msg) => {
      let result
      const username = socket.handshake.auth.username ?? 'anonymous'
      console.log({ username })
      try {
        result = await db.execute({
          sql: 'INSERT INTO messages (content, user) VALUES (:msg, :username)',
          args: { msg, username }
        })
      } catch (e) {
        console.error(e)
        return
      }
  
      io.emit('chat message', msg, result.lastInsertRowid.toString(), username)
    })
    console.log('auth')
    console.log(socket.handshake.auth)
    //Recuperar los mensajes anteriores a la conexion
    if(!socket.recovered){
        try{
            //Mandamos el offset desde el cliente donde lo usara para determinar las ids de los mensajes no recuperados
            const results = await db.execute({
                sql:'SELECT id,content,user FROM messages WHERE id > ?',
                args:[socket.handshake.auth.serverOffset ?? 0]
        })
        //Le mandamos todos los rows faltantes
        results.rows.forEach(row=>{
            socket.emit('chat message',row.content,row.id.toString(),row.user)
        })
        }catch (e){
            console.error(e)
        }
    }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html')
});

server.listen(port, () => {
    console.log(`Server started on ${port}`);
});