/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: false,
	webpack: (config) => {
		config.module.rules.push({
			test: /\.ya?ml$/,
			type: 'asset/source',
		});
		return config;
	},
	turbopack: {
		rules: {
			"*.{fx}": {
				loaders: ["raw-loader"],
				as: "*.js",
			},
		},
	},
};

module.exports = nextConfig;
