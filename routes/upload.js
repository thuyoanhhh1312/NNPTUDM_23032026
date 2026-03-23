var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require("../utils/uploadHandler");
let path = require("path");
let excelJS = require("exceljs");
let fs = require("fs");
let crypto = require("crypto");
let productModel = require("../schemas/products");
let InventoryModel = require("../schemas/inventories");
let userModel = require("../schemas/users");
let roleModel = require("../schemas/roles");
let mailHandler = require("../utils/sendMailHandler");
let mongoose = require("mongoose");
let slugify = require("slugify");

router.post("/single", uploadImage.single("file"), function (req, res, next) {
  if (!req.file) {
    res.status(404).send({
      message: "file upload rong",
    });
  } else {
    res.send(req.file.path);
  }
});
router.post("/multiple", uploadImage.array("files"), function (req, res, next) {
  if (!req.files) {
    res.status(404).send({
      message: "file upload rong",
    });
  } else {
    let data = req.body;
    console.log(data);
    let result = req.files.map((f) => {
      return {
        filename: f.filename,
        path: f.path,
        size: f.size,
      };
    });
    res.send(result);
  }
});
router.get("/:filename", function (req, res, next) {
  let fileName = req.params.filename;
  let pathFile = path.join(__dirname, "../uploads", fileName);
  res.sendFile(pathFile);
});

router.post(
  "/excel",
  uploadExcel.single("file"),
  async function (req, res, next) {
    if (!req.file) {
      res.status(404).send({
        message: "file upload rong",
      });
    } else {
      //workbook->worksheet-row/column->cell
      let pathFile = path.join(__dirname, "../uploads", req.file.filename);
      let workbook = new excelJS.Workbook();
      await workbook.xlsx.readFile(pathFile);
      let worksheet = workbook.worksheets[0];
      let products = await productModel.find({});
      let getTitle = products.map((p) => p.title);
      let getSku = products.map((p) => p.sku);
      let result = [];
      let errors = [];
      for (let index = 2; index <= worksheet.rowCount; index++) {
        let errorRow = [];
        const row = worksheet.getRow(index);
        let sku = row.getCell(1).value; //unique
        let title = row.getCell(2).value;
        let category = row.getCell(3).value;
        let price = Number.parseInt(row.getCell(4).value);
        let stock = Number.parseInt(row.getCell(5).value);
        //validate
        if (price < 0 || isNaN(price)) {
          errorRow.push("dinh dang price chua dung " + price);
        }
        if (stock < 0 || isNaN(stock)) {
          errorRow.push("dinh dang stock chua dung " + stock);
        }
        if (getTitle.includes(title)) {
          errorRow.push("title da ton tai");
        }
        if (getSku.includes(sku)) {
          errorRow.push("sku da ton tai");
        }
        if (errorRow.length > 0) {
          result.push({ success: false, data: errorRow });
          continue;
        } else {
          let session = await mongoose.startSession();
          session.startTransaction();
          try {
            let newObj = new productModel({
              sku: sku,
              title: title,
              slug: slugify(title, {
                replacement: "-",
                remove: undefined,
                locale: "vi",
                trim: true,
              }),
              price: price,
              description: title,
              category: category,
            });
            let newProduct = await newObj.save({ session });
            let newInv = new InventoryModel({
              product: newProduct._id,
              stock: stock,
            });
            newInv = await newInv.save({ session });
            await newInv.populate("product");
            await session.commitTransaction();
            await session.endSession();
            getSku.push(sku);
            getTitle.push(title);
            result.push({ success: true, data: newInv });
          } catch (error) {
            await session.abortTransaction();
            await session.endSession();
            errorRow.push(error.message);
            result.push({ success: false, data: errorRow });
          }
        }
      }
      result = result.map(function (e, index) {
        if (e.success) {
          return index + 1 + ": " + e.data.product.title;
        } else {
          return index + 1 + ": " + e.data;
        }
      });
      res.send(result);
      fs.unlinkSync(pathFile);
    }
  },
);

router.post(
  "/excel-users",
  uploadExcel.single("file"),
  async function (req, res, next) {
    if (!req.file) {
      return res.status(404).send({
        message: "file upload rong",
      });
    }

    let pathFile = path.join(__dirname, "../uploads", req.file.filename);

    try {
      let workbook = new excelJS.Workbook();
      await workbook.xlsx.readFile(pathFile);
      let worksheet = workbook.worksheets[0];

      if (!worksheet || worksheet.rowCount < 2) {
        return res.status(400).send({ message: "File excel khong co du lieu" });
      }

      let roleUser = await roleModel.findOne({
        name: { $regex: /^user$/i },
        isDeleted: false,
      });

      if (!roleUser) {
        return res.status(400).send({
          message: "Khong tim thay role user. Hay tao role user truoc.",
        });
      }

      const extractCellText = function (cellValue) {
        if (cellValue === null || cellValue === undefined) {
          return "";
        }

        if (
          typeof cellValue === "string" ||
          typeof cellValue === "number" ||
          typeof cellValue === "boolean"
        ) {
          return String(cellValue);
        }

        if (cellValue instanceof Date) {
          return cellValue.toISOString();
        }

        if (Array.isArray(cellValue.richText)) {
          return cellValue.richText
            .map(function (part) {
              return part.text || "";
            })
            .join("");
        }

        if (typeof cellValue.text === "string") {
          return cellValue.text;
        }

        if (
          typeof cellValue.result === "string" ||
          typeof cellValue.result === "number" ||
          typeof cellValue.result === "boolean"
        ) {
          return String(cellValue.result);
        }

        if (typeof cellValue.hyperlink === "string") {
          if (cellValue.hyperlink.toLowerCase().startsWith("mailto:")) {
            return cellValue.hyperlink.slice(7);
          }
          return cellValue.hyperlink;
        }

        return "";
      };

      const headerRow = worksheet.getRow(1);
      let usernameCol = null;
      let emailCol = null;

      for (let c = 1; c <= headerRow.cellCount; c++) {
        let headerValue = headerRow.getCell(c).value;
        let normalized = extractCellText(headerValue).trim().toLowerCase();
        if (normalized === "username") {
          usernameCol = c;
        }
        if (normalized === "email") {
          emailCol = c;
        }
      }

      if (!usernameCol || !emailCol) {
        return res
          .status(400)
          .send({ message: "Header phai co 2 cot: username, email" });
      }

      let result = [];

      for (let index = 2; index <= worksheet.rowCount; index++) {
        let row = worksheet.getRow(index);
        let username = extractCellText(row.getCell(usernameCol).value).trim();
        let email = extractCellText(row.getCell(emailCol).value)
          .replace(/\u00A0/g, " ")
          .replace(/\s+/g, "")
          .trim()
          .toLowerCase();
        let rowErrors = [];

        if (!username) {
          rowErrors.push("username rong");
        }

        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
          rowErrors.push("email khong hop le");
        }

        if (rowErrors.length === 0) {
          let existed = await userModel.findOne({
            $or: [{ username: username }, { email: email }],
          });

          if (existed) {
            rowErrors.push("username hoac email da ton tai");
          }
        }

        if (rowErrors.length > 0) {
          result.push({
            row: index,
            success: false,
            errors: rowErrors,
          });
          continue;
        }

        let randomPassword = crypto
          .randomBytes(12)
          .toString("base64")
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 16);
        while (randomPassword.length < 16) {
          randomPassword += crypto.randomBytes(2).toString("hex");
          randomPassword = randomPassword.slice(0, 16);
        }

        let createdUser = null;
        try {
          createdUser = new userModel({
            username: username,
            email: email,
            password: randomPassword,
            role: roleUser._id,
          });
          await createdUser.save();
          await mailHandler.sendImportedUserPasswordMail(
            createdUser.email,
            createdUser.username,
            randomPassword,
          );

          result.push({
            row: index,
            success: true,
            data: {
              id: createdUser._id,
              username: createdUser.username,
              email: createdUser.email,
              password: randomPassword,
              role: roleUser.name,
            },
          });
        } catch (error) {
          if (createdUser) {
            await userModel.deleteOne({ _id: createdUser._id });
          }
          result.push({
            row: index,
            success: false,
            errors: [error.message],
          });
        }
      }

      return res.send(result);
    } catch (error) {
      return res.status(400).send({ message: error.message });
    } finally {
      if (fs.existsSync(pathFile)) {
        fs.unlinkSync(pathFile);
      }
    }
  },
);

module.exports = router;
