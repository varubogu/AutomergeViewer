# Automergeビューア

Automerge ファイルをブラウザの中だけで閲覧・編集する静的ページです。Svelte コンポーネントをクライアント側で描画し、ファイルの内容はサーバーへ送りません。

## できること

- Automerge の保存データ（バイナリ、Base64）と、ルートがオブジェクトの JSON を開く
- JSON と同じ形で表示し、オブジェクトと配列を折りたたむ
- 入れ子の深さごとに色を変える
- 正規表現、XPath、JS パス（`company.seizoubu.tanaka`）で検索・置換する。大文字と小文字の区別も切り替えられる
- 行へマウスを乗せる、長押しする、右クリックすると、その値の過去の状態・編集時刻・変更メッセージ・actor を見る
- 値、キー、追加、削除を編集し、結果を `.automerge` として保存する

## 開発

```bash
npm install
npm test
npm run dev
```

本番用の静的ファイルは `npm run build` で `dist/` に出ます。`npm run preview` でその成果物を確認できます。

## 検索の書き方

正規表現は、画面に出ているキーと値に対して一致します。`課長|主任` のように書き、置換では `$1` も使えます。

XPath は JSON 向けの一部だけです。配列の番号は 1 始まりです。

- `/company/seizoubu/tanaka`
- `//tanaka`
- `/company/*/tanaka`
- `/company/employees[1]/name`
- `//*[name="tanaka"]`

JS パスの配列番号は 0 始まりです。

- `company.seizoubu.tanaka`
- `company.employees[0].name`
- `company.employees[*].dept`
- `**.note`
- `company["seizoubu"].tanaka`

パス置換で「置換値をJSONとして解釈」を付けると、`{"role":"部長"}` や `12` を値そのものとして書き込めます。
