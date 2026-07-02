import mongoose from "mongoose";

export const connectDB = (uri) => {
  mongoose
    .connect(jiouri, {
      dbName: "testnewapkccc",
    })
    .then((c) => console.log(`DB Connected to ${c.connection.host}`))
    .catch((e) => console.log(e));
};
