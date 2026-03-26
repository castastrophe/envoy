export default {
	"*.{js,json}": [
		"eslint --fix --cache --no-error-on-unmatched-pattern --quiet"
	],
	"*.{md,mdx}": [
		"prettier --no-error-on-unmatched-pattern --ignore-unknown --log-level silent --write --config .prettierrc"
	]
};
