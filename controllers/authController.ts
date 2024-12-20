// require('dotenv').config();
const Users = require("../models/users");
import { Op, where } from "sequelize";
import { NextFunction, Request, Response } from "express";
import { MulterRequest } from "../interfaces/requests/IMulterRequest";
import { User } from "../interfaces/user/IUser";
import { Filter } from "../interfaces/filtering/IFilter";
import { LOG_TYPE, logger } from "../middleware/logEvents";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import jwt from "jsonwebtoken";
import { ROLES_LIST } from "../config/parameters/roles-list";
import nodemailer from "nodemailer";
import { transporter } from "../utils/emailTransporter";
import { generateRecoveryCode } from "../utils/recoveryCodeGenerator";

const signup = async (req: Request, res: Response) => {
  const { address, email, name, password, username }: User = req.body;
  if (!username) return res.status(400).json({ error: "Username is required" });
  if (!password) return res.status(400).json({ error: "Password is required" });
  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!address) return res.status(400).json({ error: "Address is required" });
  if (!name) return res.status(400).json({ error: "Name is required" });
  const duplicate = await Users.findOne({ where: { username: username } });
  if (duplicate)
    return res
      .status(409)
      .json({ error: "User by this username already exists" });
  try {
    const accessToken = jwt.sign(
      {
        UserInfo: {
          username: username,
          role: ROLES_LIST.User,
        },
      },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: "3600s" }
    );
    const refreshToken = jwt.sign(
      { username: username },
      process.env.REFRESH_TOKEN_SECRET!,
      { expiresIn: "1d" }
    );
    const result = await Users.create({
      username: username,
      email: email,
      password: password,
      address: address,
      name: name,
      refreshToken: refreshToken,
    });
    if (!result) return res.status(500).json({ message: "server error" });

    res.cookie("jwt", refreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.status(201).json({ data: accessToken, role: ROLES_LIST.User });
  } catch (error) {
    console.log(error);
    logger(LOG_TYPE.Error, `${error}`, "Controller", "AuthController/signup");
  }
};
const login = async (req: Request, res: Response) => {
  const { password, username }: User = req.body;
  if (!username) return res.status(400).json({ error: "Username is required" });
  if (!password) return res.status(400).json({ error: "Password is required" });
  try {
    const foundUser = await Users.findOne({ where: { username: username } });
    if (!foundUser)
      return res.status(401).json({ error: "Username does not exist" });

    const passwordMatch = foundUser.password === password;
    if (!passwordMatch)
      return res.status(401).json({ message: "Invalid username or password" });

    const accessToken = jwt.sign(
      {
        UserInfo: {
          username: username,
          role: foundUser.role,
        },
      },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: "1d" }
    );
    const refreshToken = jwt.sign(
      { username: username },
      process.env.REFRESH_TOKEN_SECRET!,
      { expiresIn: "3d" }
    );
    foundUser.refreshToken = refreshToken;
    const result = await foundUser.save();
    if (!result) return res.status(500).json({ message: "Server error" });

    res.cookie("jwt", refreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.status(200).json({ data: accessToken, role: foundUser.role });
  } catch (error) {
    logger(LOG_TYPE.Error, `${error}`, "Controller", "AuthController/login");
    console.log(error);
  }
};
const logout = async (req: Request, res: Response) => {
  const { username }: User = req.body;
  if (!username) return res.status(400).json({ error: "Username is required" });
  try {
    const foundUser = await Users.findOne({ where: { username: username } });
    if (!foundUser)
      return res.status(401).json({ error: "Username does not exist" });
    foundUser.refreshToken = "";
    const result = await foundUser.save();

    if (!result) return res.status(500).json({ message: "Server error" });
    res.clearCookie("jwt", { httpOnly: true, secure: true });
    return res.status(204).json({ data: "User logged out!" });
  } catch (error) {
    logger(LOG_TYPE.Error, `${error}`, "Controller", "AuthController/logout");
    console.log(error);
  }
};
const handleRefreshToken = async (req: Request, res: Response) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  try {
    const foundUser = await Users.findOne({
      where: { RefreshToken: refreshToken },
    });
    if (!foundUser) return res.sendStatus(403); //Forbidden
    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET!,
      (err: any, decoded: any) => {
        if (err || foundUser.username !== decoded.username)
          return res.sendStatus(403);
        const accessToken = jwt.sign(
          {
            UserInfo: {
              username: foundUser.username,
              role: foundUser.role,
            },
          },
          process.env.ACCESS_TOKEN_SECRET!,
          { expiresIn: "3600s" }
        );
        res.status(200).json({ accessToken });
      }
    );
  } catch (error) {
    logger(
      LOG_TYPE.Error,
      `${error}`,
      "Controller",
      "AuthController/handleRefreshToken"
    );
    console.log(error);
  }
};
const forgetPassword = async (req: Request, res: Response) => {
  const { email }: User = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const foundUser = await Users.findOne({ where: { username: email } });
    if (!foundUser)
      return res.status(400).json({ error: "No user found by this email" });
    const recoveryCode = generateRecoveryCode(4);
    await transporter.sendMail({
      from: "your_email@example.com", // Your email address
      to: email,
      subject: "Account Recovery Code",
      text: `Your account recovery code is: ${recoveryCode}`,
    });
    const result = await foundUser.save();
    if (!result)
      return res.status(400).json({ message: "faild to save recovery Code" });
    return res.status(200).json({ data: "Recovery code sent successfully. " });
  } catch (error) {
    console.log(error);
  }
};
const validateRecoveryCode = async (req: Request, res: Response) => {
  const { email, recoveryCode } = req.body;
};
const restPassword = async (req: Request, res: Response) => {
  const { password }: User = req.body;
};
export default {
  signup,
  login,
  logout,
  forgetPassword,
  restPassword,
  handleRefreshToken,
};
