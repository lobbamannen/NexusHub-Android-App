package se.lobbamannen.nexushub.app

/** Fit the model's real token count by omitting complete old exchanges from this request only. */
internal object ChatContextBudget {
    data class Prompt(val text: String, val tokens: Int, val omittedHistoryTurns: Int)
    fun fit(roles: List<String>, contents: List<String>, requested: Int, context: Int,
            formatAndCount: (List<String>, List<String>) -> Pair<String, Int>): Prompt {
        require(roles.size == contents.size && roles.size % 2 == 1 && roles.last() == "user")
        var offset = 0
        while (true) {
            val (text,tokens) = formatAndCount(roles.drop(offset),contents.drop(offset))
            require(tokens > 0) { "Modellens prompt kunde inte tokeniseras." }
            if(tokens.toLong()+requested+16<=context)
                return Prompt(text,tokens,offset/2)
            require(offset+2<roles.size) { "Frågan och reserverad utdata överskrider kontexten." }
            offset+=2
        }
    }
}
