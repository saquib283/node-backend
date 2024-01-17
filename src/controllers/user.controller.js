import { asyncHandler } from "../utils/ayncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";

const registerUser = asyncHandler(async (req, res) => {

  // get user details from frontend.
  const { fullname, email, username, password } = req.body;

  //validation of user detail.
  if([fullname , email , username , password].some((field)=>field?.trim()==="")){
  }

  //check if user already exists.
  const existedUser = await User.findOne({
    $or : [{username},{email}]
  })
  if(existedUser){
    throw new ApiError(409,"User with email or Username already exists")
  }

  //check images , check for avatar.
  const avatarLocalPath = req.files?.avatar[0]?.path;

  if(!avatarLocalPath){
    throw new ApiError(400,"Avatar file is Required");
  }

  let coverImageLocalPath;
  if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
    coverImageLocalPath=req.files.coverImage[0].path;
  }



  //upload them to cloudinary. avatar.
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if(!avatar){
    throw new ApiError(400,"Avatar file is Required");
  }

  // create user object -  create entry in db.
  const user = await User.create({
    fullname,
    avatar:avatar.url,
    coverImage:coverImage?.url || "",
    email,
    password,
    username: (username || "").toLowerCase()
  })
  //remove password and refresh token field from response .
  const userExists=await User.findById(user._id).select(
    "-password -refreshToken"
  );
 //check for user creation .
  if(!userExists){
    throw new ApiError(500 , "Something went wrong while registering the user.")
  }
  //return response.
  return res.status(201).json(
    new ApiResponse(200 , userExists , "User registerd Successfully ." )
  )
});

export { registerUser };
