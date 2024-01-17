import connectDB from "./db/index.js";
import dotenv from "dotenv";
import { app } from "./app.js"

dotenv.config({
    path:'./.'
})

connectDB()
.then(()=>{
    app.listen(process.env.PORT || 8000 , ()=>{
        console.log(`Server listening on ${process.env.PORT || 8000}`);
    })
})
.catch()