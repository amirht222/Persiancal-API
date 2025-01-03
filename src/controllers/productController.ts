import { Op } from "sequelize";
import { NextFunction, Request, Response } from "express";
import { Product } from "../interfaces/product/IProduct";
import { MulterRequest } from "../interfaces/requests/IMulterRequest";
import { LOG_TYPE, logger } from "../middleware/logEvents";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { ProductInfo } from "../interfaces/product/IProductInfo";
import { PRODUCT_STATUS } from "../config/parameters/products-status";
import { ProductFilter } from "../interfaces/product/IProductFilter";
import fs from "fs";
const Products = require("../models/products");
const ImageUrls = require("../models/imageUrls");

const createProduct = async (req: Request, res: Response) => {
  const { description, title, provider }: Product = req.body;
  const files = (req as MulterRequest).files;

  // Check for required fields
  const message = !description
    ? "Description is Empty"
    : !title
    ? "Title is Empty"
    : !provider
    ? "Provider is Empty"
    : null;
  if (message) return res.status(400).json({ message: message });

  // Check for duplicate product title
  const duplicateByName = await Products.findOne({ where: { title: title } });
  if (duplicateByName)
    return res.status(409).json({ message: "This Title already exists" });

  try {
    const id = uuidv4();
    const result = await Products.create({
      id: id,
      title: title,
      provider: provider,
      description: description,
    });

    if (!result) return res.status(500).json({ message: "Server error" });

    if (files) {
      for (const key of Object.keys(files)) {
        const imageId = uuidv4();
        const originalFileName = files[key].name.replace(/\s/g, "");
        const fileExtension = path.extname(originalFileName);
        const uniqueFileName = `${path.basename(
          originalFileName,
          fileExtension
        )}-${imageId}${fileExtension}`;
        const filepath = path.join(
          __dirname,
          "..",
          "..",
          "images",
          uniqueFileName
        );


        await new Promise<void>((resolve, reject) => {
          files[key].mv(filepath, (err: never) => {
            if (err) {
              reject(res.status(500).json({ data: "Server error!" }));
            } else {
              resolve();
            }
          });
        });

        await ImageUrls.create({
          id: imageId,
          productId: id,
          imageUrl: `images/${uniqueFileName}`,
        });
      }
    }

    return res
      .status(201)
      .json({ data: `New Product ${result.title} created!` });
  } catch (error) {
    // Log and handle the error
    logger(
      LOG_TYPE.Error,
      `${error}`,
      "errors",
      "ProductController/createProduct"
    );
    console.log(error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getProducts = async (req: Request, res: Response) => {
  const {
    title,
    id,
    productStatus,
    isAscending = true,
    provider,
    sortOn = "title",
    itemPerPage = 0,
    currentPage = 0,
  }: ProductFilter = req.query as unknown as ProductFilter;

  const direction = isAscending ? "ASC" : "DESC";

  try {
    let conditions: any = {};
    if (title) {
      conditions.title = {
        [Op.like]: `%${title}%`,
      };
    }
    if (provider) {
      conditions.provider = {
        [Op.like]: `%${provider}%`,
      };
    }
    if (id) {
      conditions.id = {
        [Op.eq]: Number(id),
      };
    }
    if (productStatus) {
      conditions.productStatus = {
        [Op.eq]: Number(productStatus),
      };
    }

    const productsCount = await Products.count({
      where: conditions,
    });

    const { rows } = await Products.findAndCountAll({
      where: conditions,
      order: [[sortOn, direction]],
      offset:
        itemPerPage && currentPage
          ? (Number(currentPage) - 1) * Number(itemPerPage)
          : undefined,
      limit: itemPerPage ? Number(itemPerPage) : undefined,
      include: [
        {
          model: ImageUrls,
          as: "productImages",
          attributes: ["imageUrl"],
        },
      ],
    });
    // if (!rows.length) return res.status(404).json({ message: "no item found" });

    return res.status(200).json({ data: rows, count: productsCount });
  } catch (error) {
    logger(
      LOG_TYPE.Error,
      `${error}`,
      "errors",
      "ProductController/getProducts"
    );
    console.log(error);
  }
};
const getProductById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: "id is Empty" });
  try {
    const foundProcuts = await Products.findOne({
      where: { id: id },
      include: [
        {
          model: ImageUrls,
          as: "productImages",
          attributes: ["imageUrl"],
        },
      ],
    });
    if (!foundProcuts)
      return res.status(404).json({ message: "no item found" });
    const ProductInfo: ProductInfo = {
      description: foundProcuts.description,
      id: foundProcuts.id,
      title: foundProcuts.title,
    };
    return res.status(200).json({ data: ProductInfo });
  } catch (error) {
    console.log(error);
    logger(
      LOG_TYPE.Error,
      `${error}`,
      "errors",
      "ProductController/getProductById"
    );
  }
};
const changeProductStatus = async (req: Request, res: Response) => {
  const { id, productStatus } = req.body;
  if (!id) return res.status(400).json({ message: "id is Empty" });
  if (!productStatus)
    return res.status(400).json({ message: "productStatus is Empty" });

  const validProductStatusTochange = Object.entries(PRODUCT_STATUS).map(
    ([key, value]) => value
  );
  if (!validProductStatusTochange.includes(productStatus) && productStatus)
    return res.status(400).json({ message: "UserStatus is invalid" });

  try {
    const foundProcuts = await Products.findOne({ where: { id: id } });
    if (!foundProcuts)
      return res.status(404).json({ message: "no item found" });

    foundProcuts.productStatus = productStatus;
    const result = await foundProcuts.save();
    if (!result) return res.status(500).json({ message: "server error" });
    return res
      .status(200)
      .json({ data: `user by this id : ${result.id} updated!` });
  } catch (error) {
    console.log(error);
    logger(
      LOG_TYPE.Error,
      `${error}`,
      "errors",
      "ProductController/changeProductStatus"
    );
  }
};
const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: "id is Emnpty" });

  try {
    const foundProcuts = await Products.findOne({ where: { id: id } });
    if (!foundProcuts)
      return res.status(201).json({ message: "no item found" });
    foundProcuts.productStatus = PRODUCT_STATUS.Deleted;

    const result = await foundProcuts.save();
    if (!result) return res.status(500).json({ message: "server error" });

    const productImages = await ImageUrls.findAll({ where: { productId: id } });

    if (productImages.length > 0) {
      await ImageUrls.destroy({ where: { productId: id } });

      productImages.forEach((image: any) => {
        const imagePath = path.join(__dirname, "..",'..', image.imageUrl); // Full path to the image
        fs.unlink(imagePath, (err) => {
          if (err) {
            console.error(
              `Failed to delete image file: ${image.imageUrl}`,
              err
            );
          }
        });
      });
    }

    return res
      .status(200)
      .json({ data: `product by this id : ${result.id} deleted` });
  } catch (error) {
    console.log(error);
    logger(
      LOG_TYPE.Error,
      `${error}`,
      "errors",
      "ProductController/changeProductStatus"
    );
  }
};
const editProduct = async (req: Request, res: Response) => {
  const { description, title, price, id, provider }: Product = req.body;
  if (!id) return res.status(400).json({ message: "id is Empty" });
  try {
    const foundProcuts = await Products.findOne({ where: { id: id } });
    if (!foundProcuts)
      return res.status(404).json({ message: "no item found" });
    if (title) foundProcuts.title = title;
    if (description) foundProcuts.description = description;
    if (provider) foundProcuts.provider = provider;

    const result = await foundProcuts.save();
    if (!result) return res.status(500).json({ message: "server error" });
    return res
      .status(200)
      .json({ data: `user by this id : ${result.id} updated` });
  } catch (error) {
    console.log(error);
    logger(
      LOG_TYPE.Error,
      `${error}`,
      "errors",
      "ProductController/editProduct"
    );
  }
};
const AddProductImage = async (req: Request, res: Response) => {
  const { id } = req.body;
  const files = (req as MulterRequest).files;

  try {
    if (files) {
      for (const key of Object.keys(files)) {
        const imageId = uuidv4();
        // const fileUrl = `${files[key].name}`.replace(/\s/g, "");
        // const filepath = path.join(__dirname, "..", "images", fileUrl);
        const originalFileName = files[key].name.replace(/\s/g, ""); // Remove spaces
        const fileExtension = path.extname(originalFileName); // Get file extension
        const uniqueFileName = `${path.basename(
          originalFileName,
          fileExtension
        )}-${imageId}${fileExtension}`;
        const filepath = path.join(__dirname, "..",'..', "images", uniqueFileName);

        await new Promise<void>((resolve, reject) => {
          files[key].mv(filepath, (err: never) => {
            if (err) {
              reject(res.status(500).json({ data: "Server error!" }));
            } else {
              resolve();
            }
          });
        });

        await ImageUrls.create({
          id: imageId,
          productId: id,
          imageUrl: `images/${uniqueFileName}`,
        });
      }
    }
    return res.status(201).json({ data: `image uploaded!` });
  } catch (error) {
    logger(
      LOG_TYPE.Error,
      `${error}`,
      "errors",
      "ProductController/addProductImage"
    );
    console.log(error);
    return res.status(500).json({ message: "Server error" });
  }
};
const deleteProductImage = async (req: Request, res: Response) => {
  const { imageUrl } = req.body;

  if (!imageUrl)
    return res.status(404).json({ message: "image url is empty " });
  // const pathanme = imageUrl.split("/").pop();

  try {
    await ImageUrls.destroy({
      where: {
        imageUrl,
      },
    });

    fs.unlink(imageUrl!, (err) => {
      if (err) {
        return res.status(500).json({
          message: "Error removing the file from the server",
          error: err.message,
        });
      }
      res.status(200).json({ message: "Image deleted successfully" });
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: `${error}` });
  }
};
export default {
  createProduct,
  getProducts,
  getProductById,
  editProduct,
  changeProductStatus,
  deleteProduct,
  AddProductImage,
  deleteProductImage,
};
