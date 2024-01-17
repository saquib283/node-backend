import { asyncHandler } from "../utils/ayncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { jwt } from "jsonwebtoken";

//access and refresh token
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    //Find user with Id
    const user = await User.findById(userId);
    //generate access token with the method created by us in User-Model generateAccessToken()
    const accessToken = user.genrateAccessToken();
    //generate refresh token with the method created by us in User-Model generateRefrshToken()
    const refreshToken = user.generateRefreshToken();
    //save the created refresh token to database
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false }); //Does not validate password again during save
    // returning the acessToken and refresh Token
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

//REGISTER - USER
const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend.
  const { fullname, email, username, password } = req.body;

  //validation of user detail.
  if (
    [fullname, email, username, password].some((field) => field?.trim() === "")
  ) {
  }

  //check if user already exists.
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (existedUser) {
    throw new ApiError(409, "User with email or Username already exists");
  }

  //check images , check for avatar.
  const avatarLocalPath = req.files?.avatar[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is Required");
  }

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  //upload them to cloudinary. avatar.
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is Required");
  }

  // create user object -  create entry in db.
  const user = await User.create({
    fullname,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: (username || "").toLowerCase(),
  });
  //remove password and refresh token field from response .
  const userExists = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  //check for user creation .
  if (!userExists) {
    throw new ApiError(500, "Something went wrong while registering the user.");
  }
  //return response.
  return res
    .status(201)
    .json(new ApiResponse(200, userExists, "User registerd Successfully ."));
});

// LOGIN - USER
const loginUser = asyncHandler(async (req, res) => {
  // reqbody->data
  const { email, username, password } = req.body;
  //username or email
  if (!(username || email)) {
    throw new ApiError(400, "username or password is required");
  }
  // find the user
  const findUser = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (!findUser) {
    throw new ApiError(404, "User does not exists");
  }
  //check password
  const checkPassword = await findUser.isPasswordCorrect(password);
  if (!checkPassword) {
    throw new ApiError(401, "Invvalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    findUser._id
  );
  const loggedInUser = await User.findById(findUser._id).select(
    "-password - refreshtoken"
  );
  //cookie option
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

// LOGOUT - USER
const logoutUser = asyncHandler(async (req, res) => {
  const userID = req.user._id;
  await User.findByIdAndUpdate(
    userID,
    { $set: { refreshToken: undefined } },
    { new: true }
  );
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out Successfully"));
});

// REFRESH ACCESS TOKEN
const refreshAccessToken = asyncHandler(async (req, res) => {
  try {
    const incomingRefreshToken =
      req.cookies.refreshToken || req.body.refreshToken;
    if (!incomingRefreshToken) {
      throw new ApiError(401, "unauthorized request");
    }

    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh Token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used .");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };
    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, newRefreshToken },
          "Access Token Refrshed successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

// Change User's  Password.
const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userID = req.user?._id;
  const user = await User.findById(userID);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password Changed Successfully"));
});

//get current user
const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(200, req.user, "Current User Fetched succesfully.");
});

//Update Account details
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname, email } = req.body;

  if (!fullname || !email) {
    throw new ApiError(400, "All fields are required");
  }
  const user = findByIdAndUpdate(req.user?._id, {
    $set: { fullname, email },
  }).select("-password");
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account Details updated successfully"));
});

//update avatar
const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file missing");
  }
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  if (!avatar) {
    throw new ApiError(404, "Error while uploading Avatar");
  }
  const user = await User.findByIdAndUpdate(req.user?._id, {
    $set: {
      avatar: avatar.url,
    },
  }).select("-password");
  return res.status(200).json(200, user, "Avatar updated successfuly");
});
// Update user cover Image
const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;
  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover Image file missing");
  }
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);
  if (!coverImage.url) {
    throw new ApiError(404, "Error while uploading Cover Image");
  }
  const user = await User.findByIdAndUpdate(req.user?._id, {
    $set: {
      coverImage: coverImage.url,
    },
  }).select("-password");

  return res.status(200).json(200, user, "cover Image updated successfuly");
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
};
