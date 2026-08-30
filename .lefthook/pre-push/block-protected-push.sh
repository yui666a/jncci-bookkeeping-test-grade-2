#!/bin/sh
# 保護ブランチへの直接pushを止める。
#
# ローカルのブランチ名ではなく、gitが標準入力で渡すpush先のrefを見る。
# ブランチ名で判定すると `git push origin HEAD:main` のような、mainに乗る
# のにローカルではmainにいない形を取り逃す。

set -eu

protected_branches="main"

# <local ref> <local sha> <remote ref> <remote sha> が行ごとに渡る。
while read -r _local_ref _local_sha remote_ref _remote_sha; do
	case "$remote_ref" in
		refs/heads/*) ;;
		*) continue ;;
	esac

	remote_branch=${remote_ref#refs/heads/}

	for protected in $protected_branches; do
		if [ "$remote_branch" = "$protected" ]; then
			echo "$protected への直接pushはできません。" >&2
			echo "作業ブランチを切って、プルリクエスト経由でマージしてください。" >&2
			echo "" >&2
			echo "    git switch -c feat/your-branch" >&2
			echo "    git push -u origin feat/your-branch" >&2
			exit 1
		fi
	done
done

exit 0
